import type { AgentPermissionMode } from './wework';

export const agentPermissionOptions: Array<{ mode: AgentPermissionMode; label: string; description: string; tone: string }> = [
  { mode: 'ask', label: '执行前询问', description: '仅开放读取工具；需要写入时由你切换权限后继续。', tone: 'text-slate-700' },
  { mode: 'auto', label: '自动批准', description: '允许任务内输出、进度和消息；高影响操作保持关闭。', tone: 'text-slate-700' },
  { mode: 'full', label: '完全访问', description: '允许当前 Session 使用所有已启用的 WeWork 工具。', tone: 'text-orange-600' },
];

export const agentPermissionOption = (mode?: AgentPermissionMode) => agentPermissionOptions.find((item) => item.mode === (mode ?? 'auto'))!;
