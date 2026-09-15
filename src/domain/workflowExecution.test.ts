import { describe, expect, it } from 'vitest';
import { executionBlockerForWork, workflowBlockerMessage, type WorkflowExecutionState } from './workflowExecution';
const execution: WorkflowExecutionState = { teamId: 'team', workflowId: 'flow', enabled: true, status: 'blocked', runs: [], blockers: [{workId:'failed-work',runId:'run',code:'failed',reason:'failed'}] };
describe('workflow execution projection', () => {
  it('only attributes a failure to the exact work, never an unrelated task or employee', () => {
    expect(executionBlockerForWork(execution,'failed-work')?.runId).toBe('run');
    expect(executionBlockerForWork(execution,'other-work')).toBeUndefined();
    expect(executionBlockerForWork(execution,undefined)).toBeUndefined();
  });
  it('distinguishes failure, cancellation, uncertain outcomes and missing submissions', () => {
    expect(workflowBlockerMessage(execution.blockers[0])).toContain('不会自动重试');
    expect(workflowBlockerMessage({code:'cancelled',reason:''})).toContain('已停止');
    expect(workflowBlockerMessage({code:'uncertain',reason:''})).toContain('尚不确定');
    expect(workflowBlockerMessage({code:'submission_missing',reason:''})).toContain('有效交付');
    expect(workflowBlockerMessage({reason:'具体错误'})).toBe('具体错误');
  });
});
