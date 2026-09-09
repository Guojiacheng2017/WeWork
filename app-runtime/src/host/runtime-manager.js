import { HostError } from './errors.js';
export class RuntimeManager {
  constructor({ store, journal, execute, onFinish }) {
    Object.assign(this, { store, journal, execute, onFinish });
    this.active = new Map();
  }
  async start(spec) {
    if (!spec.runtimeProfile) throw new HostError('RUNTIME_PROFILE_MISSING', 'runtime profile is required', 409);
    if (this.active.has(spec.id) || [...this.active.values()].some((r) => r.employeeId === spec.employeeId)) throw new HostError('RUN_ALREADY_ACTIVE', 'employee already has an active run', 409);
    const controller = new AbortController();
    const completion = Promise.withResolvers();
    const controlsReady = Promise.withResolvers();
    this.active.set(spec.id, { controller, employeeId: spec.employeeId, group: Boolean(spec.wework?.group), adapter: spec.runtimeProfile.adapter, controlsReady, done: completion.promise });
    try {
      if (await this.store.getRun(spec.id)) throw new HostError('RUN_ALREADY_ACTIVE', 'run id was already used', 409);
      const checkpointId = spec.session?.id ?? spec.employeeId;
      const checkpoint = await this.store.getCheckpoint(checkpointId);
      if (checkpoint?.employeeId === spec.employeeId && checkpoint.adapter === spec.runtimeProfile.adapter && checkpoint.runtimeProfileId === spec.runtimeProfile.id) {
        const maxMessages = spec.runtimeSettings?.context?.maxMessages;
        const messages = Array.isArray(checkpoint.messages) && Number.isSafeInteger(maxMessages) && maxMessages > 0 ? checkpoint.messages.slice(-maxMessages) : checkpoint.messages;
        spec = { ...spec, session: { ...spec.session, nativeSessionId: checkpoint.nativeSessionId, messages } };
      }
      const run = { id: spec.id, employeeId: spec.employeeId, workId: spec.workId, sessionId: checkpointId, weworkContext: spec.wework?.context, status: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await this.store.putRun(run);
      this.journal.publish({ type: 'run.queued', runId: run.id });
      void this.perform(spec, run, controller).then(() => {
        this.active.delete(run.id);
        completion.resolve({ run });
      }, (error) => {
        // Retain the ownership fence if the terminal record could not be written.
        completion.resolve({ error });
        this.journal.publish({ type: 'run.failed', runId: run.id, error: 'Could not persist run outcome; inspect Host storage before retrying.' });
      });
      return run;
    } catch (error) { this.active.delete(spec.id); completion.resolve({ error }); throw error; }
  }
  async perform(spec, run, controller) {
    try {
      run.status = 'running'; run.updatedAt = new Date().toISOString();
      await this.store.putRun(run); this.journal.publish({ type: 'run.started', runId: run.id });
      if (controller.signal.aborted) throw controller.signal.reason;
      const result = await this.execute(spec, { signal: controller.signal, registerControls: (controls) => { const active = this.active.get(run.id); if(active) { active.controls = controls; if(controls) active.controlsReady.resolve(controls); } }, emit: (event) => this.journal.publish({ ...event, runId: run.id }) });
      if (controller.signal.aborted) throw controller.signal.reason;
      const maxMessages = spec.runtimeSettings?.context?.maxMessages;
      const messages = Array.isArray(result.messages) && Number.isSafeInteger(maxMessages) && maxMessages > 0 ? result.messages.slice(-maxMessages) : result.messages;
      await this.store.putCheckpoint(run.sessionId, { employeeId: spec.employeeId, adapter: spec.runtimeProfile.adapter, runtimeProfileId: spec.runtimeProfile.id, nativeSessionId: result.nativeSessionId, messages, usage: result.usage ?? {}, updatedAt: new Date().toISOString() });
      await this.onFinish?.(spec, result);
      Object.assign(run, { status: 'succeeded', finalText: result.finalText, updatedAt: new Date().toISOString() });
      await this.store.putRun(run); this.journal.publish({ type: 'run.succeeded', runId: run.id, finalText: result.finalText });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      try { await this.onFinish?.(spec, null, error); } catch { /* Run failure remains durable even if WeWork storage is unavailable. */ }
      Object.assign(run, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? 'cancelled' : error?.message ?? String(error), updatedAt: new Date().toISOString() });
      await this.store.putRun(run); this.journal.publish({ type: `run.${run.status}`, runId: run.id, error: run.error });
    }
  }
  async steerEmployee(employeeId, message) {
    if(typeof message !== 'string' || !message.trim() || message.length > 100000) throw new HostError('INVALID_MESSAGE', '补充消息不能为空或过长', 422);
    const entry = [...this.active.entries()].find(([, active]) => active.employeeId === employeeId);
    if(!entry) return { accepted: false };
    const [runId, active] = entry;
    if(active.group) throw new HostError('GROUP_RUN_ACTIVE', '助手正在回复群聊，请在群聊中 @ 该助手补充消息，或等待回复完成。', 409);
    if(active.adapter !== 'pi') throw new HostError('STEERING_UNSUPPORTED', '当前执行器暂不支持执行中补充消息，请等待本次执行完成。', 409);
    const controls = await Promise.race([active.controlsReady.promise, active.done.then(()=>null)]);
    if(!controls || !active.controls) { await active.done; return { accepted: false }; }
    try { await controls.steer(message.trim()); } catch(error) { if(error.code !== 'RUN_NOT_ACTIVE') throw error; await active.done; return { accepted: false }; }
    this.journal.publish({type:'assistant.activity',runId,activity:'status',text:'补充消息已发送到当前执行'});
    return { accepted: true, runId };
  }
  async cancel(id) { const active = this.active.get(id); if (!active) throw new HostError('RUN_NOT_ACTIVE', 'run is not active', 409); active.controller.abort(new Error('cancelled')); }
  async cancelAndWait(id, { timeoutMs = 15000 } = {}) {
    const active = this.active.get(id);
    if (!active) {
      const run = await this.get(id);
      if (['succeeded', 'failed', 'cancelled'].includes(run?.status)) return run;
      throw new HostError('RUN_NOT_ACTIVE', 'run has no confirmed active executor or terminal state', 409);
    }
    active.controller.abort(new Error('cancelled'));
    let timer;
    try {
      const outcome = await Promise.race([
        active.done,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new HostError('RUN_CANCEL_TIMEOUT', 'executor has not confirmed shutdown; employee remains occupied', 409)), timeoutMs); }),
      ]);
      if (outcome.error) throw new HostError('RUN_STATE_UNCERTAIN', 'executor outcome could not be persisted; ownership cannot be transferred', 409);
      return outcome.run;
    } finally { clearTimeout(timer); }
  }
  get(id) { return this.store.getRun(id); }
}
