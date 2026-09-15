import { useEffect, useState } from 'react';
import { weworkHost, type PluginManifest } from '../../runtime/weworkHost';
import type { WeWorkTeam } from '../../domain/wework';
import { PLANE_PLUGIN_ID } from '../../domain/collaboration';

export const projectPluginViews = [
  { value: 'issues', label: '工作项' },
  { value: 'board', label: '看板' },
  { value: 'gantt', label: '甘特图' },
] as const;

export const projectPluginName = (team: WeWorkTeam, catalog: PluginManifest[] = []) =>
  catalog.find(plugin => plugin.name === PLANE_PLUGIN_ID)?.interface?.displayName || (team.modules?.plugins?.[PLANE_PLUGIN_ID]?.enabled || team.modules?.projectManagement.integration
    ? 'Plane' : '项目管理');

export function usePluginCatalog() {
  const [catalog, setCatalog] = useState<PluginManifest[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void weworkHost.plugins().then(value => { if (active) setCatalog(value); }).catch(() => {}); };
    refresh();
    window.addEventListener('wework:plugins-changed', refresh);
    return () => { active = false; window.removeEventListener('wework:plugins-changed', refresh); };
  }, []);
  return catalog;
}
