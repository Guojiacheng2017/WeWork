import type { WeWorkTeam } from '../../domain/wework';
import { PLANE_PLUGIN_ID } from '../../domain/collaboration';

export const projectPluginViews = [
  { value: 'issues', label: '工作项' },
  { value: 'board', label: '看板' },
  { value: 'gantt', label: '甘特图' },
] as const;

export const projectPluginName = (team: WeWorkTeam) =>
  team.modules?.plugins?.[PLANE_PLUGIN_ID]?.enabled || team.modules?.projectManagement.integration
    ? 'Plane' : '项目管理';
