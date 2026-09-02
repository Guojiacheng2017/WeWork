import { randomUUID } from 'node:crypto';

const terminal = new Set(['succeeded', 'failed', 'cancelled']);
export class CollaborationCoordinator {
  constructor({ wework, runtime, intervalMs = 200 }) {
    Object.assign(this, { wework, runtime, intervalMs });
    this.transitioning = new Set(); this.starting = new Set(); this.timer = null; this.pending = null; this.closed = false;
  }
  busy(employeeId) { return this.transitioning.has(employeeId) || this.starting.has(employeeId) || [...(this.runtime.active?.values() ?? [])].some((run) => run.employeeId === employeeId); }
  async recover() { return this.drain(); }
  drain() {
    if (this.closed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.tick().finally(() => {
      this.pending = null;
      if (!this.closed) { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.drain().catch(() => {}); }, this.intervalMs); this.timer.unref?.(); }
    });
    return this.pending;
  }
  async tick() {
    let state = await this.wework.api.snapshot();
    for (const team of state.teams) {
      for (const delivery of team.collaborationDeliveries ?? []) {
        if (!['running', 'uncertain'].includes(delivery.status) || !delivery.runId) continue;
        let run;
        try { run = await this.runtime.get(delivery.runId); }
        catch (error) { if (!['RUN_NOT_FOUND', 'ENOENT'].includes(error.code)) throw error; }
        if (run && terminal.has(run.status)) {
          await this.wework.api.finishGroupDelivery(team.id, delivery.id, delivery.runId, { status: run.status, finalText: run.finalText, error: run.error });
          this.runtime.journal?.publish({ type: 'wework.updated', runId: delivery.runId });
        } else if (delivery.status !== 'uncertain' && (!run || !this.runtime.active?.has(delivery.runId))) {
          await this.wework.api.finishGroupDelivery(team.id, delivery.id, delivery.runId, { status: 'uncertain', error: 'Execution cannot be confirmed after interruption. No automatic replay; inspect the native run.' });
          this.runtime.journal?.publish({ type: 'wework.updated', runId: delivery.runId });
        }
      }
    }
    state = await this.wework.api.snapshot();
    for (const team of state.teams) {
      for (const delivery of team.collaborationDeliveries ?? []) {
        if (delivery.status !== 'queued' || this.busy(delivery.employeeId)) continue;
        if (state.teams.some((t) => t.collaborationDeliveries?.some((d) => d.employeeId === delivery.employeeId && ['running', 'uncertain'].includes(d.status)))) continue;
        const runId = `group-${randomUUID()}`;
        await this.wework.api.reserveGroupDelivery(team.id, delivery.id, runId);
        // Update our scan snapshot so a second queued delivery cannot race the first.
        delivery.status = 'running'; delivery.runId = runId;
        this.runtime.journal?.publish({ type: 'wework.updated', runId });
        try {
          await this.wework.startRun({ id: runId, wework: { deliveryId: delivery.id } }, this.runtime);
        } catch (error) {
          let run;
          try { run = await this.runtime.get(runId); } catch { /* Absence after a rejected start is expected. */ }
          if (!run) {
            await this.wework.api.finishGroupDelivery(team.id, delivery.id, runId, { status: 'failed', error: error.message ?? 'Failed to start employee' });
            this.runtime.journal?.publish({ type: 'wework.updated', runId });
          }
          // If start persisted a run, reconcile its actual outcome next tick.
        }
      }
    }
  }
  async withAdmission(employeeId, operation) {
    if (this.busy(employeeId)) throw new Error('employee is running or changing ownership');
    this.starting.add(employeeId);
    try { return await operation(); } finally { this.starting.delete(employeeId); }
  }
  async withEmployees(employeeIds, operation) {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (ids.some((id) => this.transitioning.has(id) || this.starting.has(id))) throw new Error('employee ownership transition already in progress');
    ids.forEach((id) => this.transitioning.add(id));
    try { return await operation(); }
    finally { ids.forEach((id) => this.transitioning.delete(id)); void this.drain().catch(() => {}); }
  }
  async stopEmployee(employeeId) {
    const runs = [...(this.runtime.active?.entries() ?? [])].filter(([, run]) => run.employeeId === employeeId);
    for (const [runId] of runs) {
      if (!this.runtime.cancelAndWait) throw new Error('adapter cannot confirm cancellation; ownership is unchanged');
      await this.runtime.cancelAndWait(runId);
      const run = await this.runtime.get(runId);
      if (!run || !terminal.has(run.status)) throw new Error('execution stop is unconfirmed; ownership is unchanged');
    }
    const state = await this.wework.api.snapshot();
    for (const team of state.teams) for (const delivery of team.collaborationDeliveries ?? []) {
      if (delivery.employeeId !== employeeId || !['running', 'uncertain'].includes(delivery.status)) continue;
      const run = delivery.runId ? await this.runtime.get(delivery.runId) : null;
      if (!run || !terminal.has(run.status)) throw new Error('unresolved group execution; ownership is unchanged');
      await this.wework.api.finishGroupDelivery(team.id, delivery.id, delivery.runId, { status: run.status, finalText: run.finalText, error: run.error });
    }
  }
  async cancelGroupDelivery(teamId, deliveryId) {
    const read = async () => (await this.wework.api.snapshot()).teams.find((t) => t.id === teamId)?.collaborationDeliveries?.find((d) => d.id === deliveryId);
    const initial = await read();
    if (!initial) throw new Error('delivery not found');
    if (initial.status === 'uncertain') throw new Error('unresolved execution must be inspected before cancellation');
    if (terminal.has(initial.status)) return initial;
    return this.withEmployees([initial.employeeId], async () => {
      const delivery = await read();
      if (delivery.status === 'queued') return this.wework.api.cancelGroupDelivery(teamId, deliveryId);
      if (terminal.has(delivery.status)) return delivery;
      if (delivery.status !== 'running' || !delivery.runId) throw new Error('unresolved execution must be inspected before cancellation');
      if (!this.runtime.cancelAndWait) throw new Error('adapter cannot confirm cancellation');
      await this.runtime.cancelAndWait(delivery.runId);
      const run = await this.runtime.get(delivery.runId);
      if (!run || !terminal.has(run.status)) throw new Error('execution stop is unconfirmed');
      const result = await this.wework.api.finishGroupDelivery(teamId, deliveryId, delivery.runId, { status: run.status, finalText: run.finalText, error: run.error });
      this.runtime.journal?.publish({ type: 'wework.updated', runId: delivery.runId });
      return result;
    });
  }
  async decideHandoff(teamId, input) {
    const team = (await this.wework.api.snapshot()).teams.find((t) => t.id === teamId);
    const handoff = team?.handoffs?.find((h) => h.id === input.handoffId);
    if (!handoff) throw new Error('handoff not found');
    if (input.decision !== 'accepted' || handoff.status !== 'requested') return this.wework.api.decideHandoff(teamId, input);
    return this.withEmployees([handoff.fromEmployeeId, handoff.toEmployeeId], async () => {
      await this.stopEmployee(handoff.fromEmployeeId);
      return this.wework.api.decideHandoff(teamId, input);
    });
  }
  async close() { this.closed = true; clearTimeout(this.timer); await this.pending; }
}
