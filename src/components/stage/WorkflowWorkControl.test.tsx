import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorkflowWorkControl } from './WorkflowWorkControl';
import type { WorkflowExecutionState } from '../../domain/workflowExecution';
const base: WorkflowExecutionState = { teamId: 't', workflowId: 'f', enabled: false, status: 'running', blockers: [], runs: [] };
const render = (execution: WorkflowExecutionState) => renderToStaticMarkup(<WorkflowWorkControl execution={execution} onControl={async () => {}} onOpenWork={() => {}} />);
it('offers a plain-language continue action for a paused existing workflow', () => {
  const html = render(base);
  expect(html).toContain('本项工作已暂停');
  expect(html).toContain('继续工作');
  expect(html).not.toContain('调度');
});
it('keeps the actual blocking reason and a task entry visible', () => {
  const html = render({ ...base, status: 'blocked', blockers: [{ workId: 'w', code: 'failed', reason: 'failed' }] });
  expect(html).toContain('执行失败');
  expect(html).toContain('查看任务');
});
it('does not offer to continue completed work', () => {
  const html = render({ ...base, status: 'completed' });
  expect(html).toContain('工作已完成');
  expect(html).not.toContain('<button');
});
