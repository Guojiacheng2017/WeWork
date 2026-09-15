export type WorkflowExecutionBlocker = { workId?: string; runId?: string; code?: string; detail?: string; reason: string };
export type WorkflowExecutionState = {
  teamId: string;
  workflowId: string;
  enabled: boolean;
  status: 'running' | 'blocked' | 'completed';
  blockers: WorkflowExecutionBlocker[];
  runs: Array<{ employeeId: string; workId: string; runId: string }>;
};

export function executionBlockerForWork(execution: WorkflowExecutionState | undefined, workId: string | undefined) {
  return workId ? execution?.blockers.find(blocker => blocker.workId === workId) : undefined;
}

export function workflowBlockerMessage(blocker: WorkflowExecutionBlocker) {
  switch (blocker.code ?? blocker.reason) {
    case 'failed': return '执行失败；请查看任务会话处理原因，系统不会自动重试。';
    case 'cancelled': return '执行已停止；下游不会因此自动推进。';
    case 'uncertain': return '执行结果尚不确定；请核查已有记录，系统不会自动重跑。';
    case 'submission_missing': return '执行已结束，但缺少本次运行的有效交付，暂不推进下游。';
    case 'no_runnable_work': return '没有可执行的工作；请检查任务分配和依赖。';
    default: return blocker.reason;
  }
}
