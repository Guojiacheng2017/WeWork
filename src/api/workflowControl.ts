import type { HostWeWorkBridge } from './hostWeWorkApi';

// Keep execution control on the Host that owns the graph, never on the browser copy.
export async function controlWorkflowWork(host: HostWeWorkBridge | undefined, teamId: string, workflowId: string, continueWork: boolean) {
  if (!host) throw new Error('当前连接不支持继续或暂停工作，请在桌面端打开此团队。');
  return host.weworkCall(continueWork ? 'resumeWorkflowExecution' : 'pauseWorkflowExecution', [teamId, workflowId]);
}
