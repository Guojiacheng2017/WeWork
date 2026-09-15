import { createHash } from 'node:crypto';

// Explicit invocation only: the caller authorizes this already-started workflow.
// Dependency ordering and document propagation remain owned by LocalWeWorkApi.
const locks = new WeakMap();
export class WorkflowExecutor {
  constructor({ wework, runtime }) { Object.assign(this, { wework, runtime }); }
  tick(teamId, workflowId, continuations = {}) {
    const previous = locks.get(this.runtime) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.advance(teamId, workflowId, continuations));
    locks.set(this.runtime, next);
    return next;
  }
  async advance(teamId, workflowId, continuations) {
    const load = async () => {
      const team = (await this.wework.api.snapshot()).teams.find(t => t.id === teamId);
      if (!team) throw new Error('workflow team not found');
      const workflow = team.workflows?.find(w => w.id === workflowId) ?? (team.workflow?.id === workflowId ? team.workflow : undefined);
      if (!workflow) throw new Error('workflow not found');
      if (!workflow.nodes.length || workflow.nodes.some(n => !n.workItemId)) throw new Error('workflow must be started before execution');
      // Local read projection only; never change the user's selected graph.
      team.workflow = workflow;
      return team;
    };
    let team = await load();
    const blockers = [], runs = [];
    for (const initial of team.employees) {
      team = await load();
      const employee = team.employees.find(e => e.id === initial.id);
      const work = employee?.currentWorkItem;
      if (!work || work.workflowId !== workflowId || work.status !== 'running') continue;
      const continuation = continuations[work.id];
      const runId = continuation?.runId ?? `dag-${createHash('sha256').update(JSON.stringify([teamId,workflowId,work.id])).digest('hex')}`;
      const run = await this.runtime.get(runId);
      runs.push({ employeeId: employee.id, workId: work.id, runId });
      const active = [...this.runtime.active.values()].some(r => r.employeeId === employee.id);
      if (active) continue;
      if (run) {
        if (run.employeeId !== employee.id || run.workId !== work.id) throw new Error('durable workflow run identity mismatch');
        if (run.status !== 'succeeded') {
          blockers.push({ workId: work.id, runId, code: ['failed','cancelled'].includes(run.status) ? run.status : 'uncertain', detail: run.error, reason: ['failed','cancelled'].includes(run.status) ? run.status : 'uncertain: interrupted execution requires inspection; no automatic replay' });
          continue;
        }
        const submission = work.records?.deliverables.at(-1);
        if (!submission || submission.actor?.runId !== runId || submission.actor?.employeeId !== employee.id || !['submitted', 'accepted'].includes(work.deliveryStatus)) {
          blockers.push({ workId: work.id, runId, code: 'submission_missing', reason: 'matching current submission required before DAG progression' });
          continue;
        }
        const finish = async () => {
          const fresh = await load();
          if (fresh.employees.find(e => e.id === employee.id)?.currentWorkItem?.id !== work.id) throw new Error('workflow ownership changed before completion');
          await this.wework.api.completeCurrent(employee.id);
          this.runtime.journal?.publish({ type: 'wework.updated', runId });
        };
        if (this.wework.coordinator) await this.wework.coordinator.withEmployees([employee.id], finish);
        else await finish();
      } else {
        if (this.wework.coordinator?.busy(employee.id)) continue;
        await this.wework.startRun({ id: runId, employeeId: employee.id, workId: work.id, ...(continuation ? {prompt: continuation.prompt} : {}) }, this.runtime, { workflowExecution: true });
      }
    }
    team = await load();
    const completed = team.workflow.nodes.every(n => n.status === 'completed');
    const assigned = team.employees.some(e => e.currentWorkItem?.workflowId === workflowId);
    if (!completed && !assigned && !blockers.length) blockers.push({ code: 'no_runnable_work', reason: 'workflow has no assigned runnable work; assignment or dependency intervention required' });
    return { teamId, workflowId, status: completed ? 'completed' : blockers.length ? 'blocked' : 'running', blockers, runs };
  }
}
