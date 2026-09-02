export type PortalPage =
  | 'businessPerformance'
  | 'personalPerformance'
  | 'businessBreakdown'
  | 'taskMatching'
  | 'taskExecution'
  | 'taskMonitoring'
  | 'taskFeedback';

export type PortalNavigationItem = { id: PortalPage; label: string };

export const performancePages: PortalNavigationItem[] = [
  { id: 'businessPerformance', label: '业务绩效' },
  { id: 'personalPerformance', label: '个人绩效' },
];

export const servicePages: PortalNavigationItem[] = [
  { id: 'businessBreakdown', label: '业务分解' },
  { id: 'taskMatching', label: '任务匹配' },
  { id: 'taskExecution', label: '任务执行' },
  { id: 'taskMonitoring', label: '任务监控' },
  { id: 'taskFeedback', label: '任务反馈' },
];

export const portalPageMeta: Record<PortalPage, { group: '团队绩效考核' | '服务受理'; title: string; description: string; step?: number }> = {
  businessPerformance: { group: '团队绩效考核', title: '业务绩效', description: '按团队业务承接与交付情况查看整体绩效。' },
  personalPerformance: { group: '团队绩效考核', title: '个人绩效', description: '按助手查看任务执行、交付与在岗状态。' },
  businessBreakdown: { group: '服务受理', title: '业务分解', description: '将已受理业务拆分为目标明确、可执行的工作任务。', step: 1 },
  taskMatching: { group: '服务受理', title: '任务匹配', description: '依据岗位能力与在岗状态匹配合适的助手。', step: 2 },
  taskExecution: { group: '服务受理', title: '任务执行', description: '跟踪助手当前执行任务与待执行队列。', step: 3 },
  taskMonitoring: { group: '服务受理', title: '任务监控', description: '集中监控任务运行状态、优先级与异常情况。', step: 4 },
  taskFeedback: { group: '服务受理', title: '任务反馈', description: '汇总已完成任务与交付成果，形成服务闭环。', step: 5 },
};
