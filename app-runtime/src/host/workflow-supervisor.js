import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { WorkflowExecutor } from './workflow-executor.js';

// Only explicitly enrolled graphs run. Pausing stops future admissions, not active work.
export class WorkflowSupervisor {
  constructor({ wework, runtime, path, intervalMs = 1000 }) {
    Object.assign(this, { wework, runtime, path, intervalMs });
    this.executor = new WorkflowExecutor({ wework, runtime });
    this.pending = Promise.resolve();
    this.entries = [];
    try { this.entries = JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!Array.isArray(this.entries)) throw new Error('Invalid workflow execution registry');
  }
  serial(fn) {
    const next = this.pending.catch(() => {}).then(fn);
    this.pending = next;
    return next;
  }
  persist() {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.entries), { mode: 0o600 });
      renameSync(`${this.path}.tmp`, this.path);
    } catch (error) { this.lastError = error.message; this.closed = true; clearTimeout(this.timer); this.runtime.journal?.publish({ type: 'wework.updated' }); throw error; }
  }
  snapshot(teamId) {
    return this.entries.filter(entry => entry.teamId === teamId).map(entry => structuredClone(this.lastError ? {
      ...entry, enabled: false, status: 'blocked', blockers: [...entry.blockers, { code: 'storage_error', reason: `调度存储不可用：${this.lastError}` }],
    } : entry));
  }
  owns(teamId, workflowId) { return this.entries.some(e => e.teamId === teamId && e.workflowId === workflowId); }
  start(teamId) {
    return this.serial(async () => {
      if (this.closed) throw new Error('Workflow supervisor is closed');
      const team = (await this.wework.api.snapshot()).teams.find(t => t.id === teamId);
      if (!team?.workflow) throw new Error('Workflow not found');
      const workflowId = team.workflow.id;
      const existing = this.entries.find(e => e.teamId === teamId && e.workflowId === workflowId);
      if (existing) return team.workflow; // repeated Start does not resume a paused graph
      const started = team.workflow.nodes.some(n => n.workItemId);
      if (started) {
        // Old renderer runs have different IDs. Never replay them under a new owner.
        const runs = await this.runtime.store.runsForWork(team.workflow.nodes.map(n => n.workItemId));
        if (runs.length) throw new Error('Existing workflow executions require migration review before Host enrollment');
      }
      const workflow = started ? team.workflow : await this.wework.api.startWorkflow(teamId);
      this.entries.push({ teamId, workflowId, enabled: true, status: 'running', blockers: [], runs: [] });
      this.persist();
      this.runtime.journal?.publish({ type: 'wework.updated' });
      return workflow;
    });
  }
  control(teamId, workflowId, enabled) {
    return this.serial(() => {
      const entry = this.entries.find(e => e.teamId === teamId && e.workflowId === workflowId);
      if (!entry) throw new Error('Workflow is not enrolled');
      if (enabled !== undefined) {
        if (this.closed) throw new Error('Workflow supervisor is closed');
        entry.enabled = enabled; this.persist();
        this.runtime.journal?.publish({ type: 'wework.updated' });
      }
      return structuredClone(entry);
    });
  }
  continueWork(teamId, workflowId, employeeId, workId, text) {
    return this.serial(async () => {
      if (this.closed) throw new Error('工作服务暂不可用，请稍后重试。');
      const entry = this.entries.find(e => e.teamId === teamId && e.workflowId === workflowId);
      if (!entry) throw new Error('找不到这项工作的执行记录。');
      const team = (await this.wework.api.snapshot()).teams.find(t => t.id === teamId);
      const employee = team?.employees.find(e => e.id === employeeId);
      const work = employee?.currentWorkItem;
      if (work?.id !== workId || work.workflowId !== workflowId || work.status !== 'running' || work.cancelledAt) throw new Error('这项工作已结束或分配已变化，请刷新后查看。');
      if ([...this.runtime.active.values()].some(run => run.employeeId === employeeId)) throw new Error('助手刚开始执行，请再发送一次补充指令。');
      entry.continuations ??= {};
      const pending = entry.continuations[workId];
      const pendingRun = pending ? await this.runtime.get(pending.runId) : undefined;
      const continuation = pending && !pendingRun ? { ...pending, prompt: `${pending.prompt}\n${text}` } : { runId: `dag-followup-${randomUUID()}`, prompt: text };
      await this.wework.api.sendMessage(employeeId, text, workId);
      entry.continuations[workId] = continuation;
      entry.enabled = true;
      entry.status = 'running';
      entry.blockers = entry.blockers.filter(blocker => blocker.workId !== workId);
      this.persist();
      this.runtime.journal?.publish({type:'wework.updated'});
      return { queued: true, runId: continuation.runId };
    });
  }
  tick() {
    return this.serial(async () => {
      if (this.closed) return;
      for (const entry of this.entries) {
        if (!entry.enabled || entry.status === 'completed') continue;
        const before = JSON.stringify(entry);
        try { Object.assign(entry, await this.executor.tick(entry.teamId, entry.workflowId, entry.continuations)); }
        catch (error) { entry.status = 'blocked'; entry.blockers = [{ code: error.code, reason: error.message }]; if (error.code !== 'EMPLOYEE_BUSY') entry.enabled = false; }
        if (JSON.stringify(entry) !== before) {
          this.persist();
          this.runtime.journal?.publish({ type: 'wework.updated' });
        }
      }
    });
  }
  async recover() {
    if (this.recovered || this.closed) return;
    this.recovered = true;
    await this.tick();
    const schedule = () => {
      if (this.closed) return;
      this.timer = setTimeout(() => { void this.tick().catch(error => {
        this.lastError = error.message;
        this.runtime.journal?.publish({ type: 'wework.updated' });
        this.closed = true; // storage failure must not silently continue dispatching
      }).finally(schedule); }, this.intervalMs);
      this.timer.unref?.();
    };
    schedule();
  }
  async close() { this.closed = true; clearTimeout(this.timer); await this.pending.catch(() => {}); }
}
