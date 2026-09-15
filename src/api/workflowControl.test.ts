import { expect, it, vi } from 'vitest';
import { controlWorkflowWork } from './workflowControl';
it('continues the exact graph through its owner, without starting or replaying it', async () => {
  const host = { weworkCall: vi.fn().mockResolvedValue({ enabled: true }) };
  await controlWorkflowWork(host, 'team', 'existing-flow', true);
  expect(host.weworkCall).toHaveBeenCalledExactlyOnceWith('resumeWorkflowExecution', ['team', 'existing-flow']);
});
it('pauses future work through the same owner', async () => {
  const host = { weworkCall: vi.fn().mockResolvedValue({ enabled: false }) };
  await controlWorkflowWork(host, 'team', 'flow', false);
  expect(host.weworkCall).toHaveBeenCalledExactlyOnceWith('pauseWorkflowExecution', ['team', 'flow']);
});
it('surfaces failures instead of claiming work has resumed', async () => {
  await expect(controlWorkflowWork(undefined, 'team', 'flow', true)).rejects.toThrow('桌面端');
  await expect(controlWorkflowWork({ weworkCall: vi.fn().mockRejectedValue(new Error('offline')) }, 'team', 'flow', true)).rejects.toThrow('offline');
});
