import { PLANE_PLUGIN_ID } from '../../domain/collaboration';
import { useState, useLayoutEffect, useRef } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { CircleDot, GitFork, Layers, Users } from 'lucide-react';
import { Badge, Select } from '../ui';
import { projectPluginName, projectPluginViews, usePluginCatalog } from '../project/projectNavigation';

export function StageHeader({ onPluginSelect }: { onPluginSelect: (plugin: { id: string; name: string; description: string } | null) => void }) {
  const catalog = usePluginCatalog();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const capsuleRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ left: 4, width: 0, visible: false });
  useLayoutEffect(() => {
    const capsule = capsuleRef.current;
    if (!capsule) return;
    const sync = () => {
      const active = capsule.querySelector<HTMLButtonElement>('button[aria-current="page"]');
      if (active) setIndicator(previous => previous.left === active.offsetLeft && previous.width === active.offsetWidth && previous.visible ? previous : { left: active.offsetLeft, width: active.offsetWidth, visible: true });
      else setIndicator(previous => previous.visible ? { ...previous, visible: false } : previous);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(capsule);
    capsule.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  });
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const syncHeight = () => document.documentElement.style.setProperty('--wework-toolbar-height', `${header.getBoundingClientRect().height}px`);
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--wework-toolbar-height'); };
  }, []);
  const { teams, selectedTeamId, topology, setTopology } = useWeWorkStore();
  const currentTeam = teams.find(team => team.id === selectedTeamId);
  if (!currentTeam) return <header ref={headerRef} className="wework-stage-header shrink-0 border-b border-slate-200 bg-white" />;
  const project = currentTeam.modules?.projectManagement;
  const capabilities = new Set(project?.enabled ? project.capabilities : []);
  const availableProjectViews = projectPluginViews.filter(view => capabilities.has(view.value));
  const enabledPlugins = Object.entries(currentTeam.modules?.plugins ?? {}).filter(([id, plugin]) => plugin.enabled && catalog.find(item => item.name === id)?.enabled !== false).map(([id]) => {
    const manifest = catalog.find(item => item.name === id);
    return { value: id, label: manifest?.interface?.displayName || (id === PLANE_PLUGIN_ID ? 'Plane' : id), description: manifest?.description || '' };
  });
  if (!Object.keys(currentTeam.modules?.plugins ?? {}).length && availableProjectViews.length && catalog.find(item => item.name === PLANE_PLUGIN_ID)?.enabled !== false) enabledPlugins.push({ value: PLANE_PLUGIN_ID, label: projectPluginName(currentTeam), description: '' });
  const selectedPlugin = enabledPlugins.find(item => item.value === selection[currentTeam.id]) ?? enabledPlugins[0];
  const pluginSelected = topology === 'plugin' || availableProjectViews.some(view => view.value === topology);
  const activatePlugin = (id: string) => {
          setSelection(previous => ({ ...previous, [currentTeam.id]: id }));
          const plugin = enabledPlugins.find(item => item.value === id)!;
          if (id === PLANE_PLUGIN_ID && availableProjectViews.length) {
            onPluginSelect(null);
            setTopology(availableProjectViews.some(item => item.value === topology) ? topology : availableProjectViews[0].value);
          } else {
            onPluginSelect({ id, name: plugin.label, description: plugin.description });
            setTopology('plugin');
          }

  };
  return <header ref={headerRef} className="wework-stage-header h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between z-10 shrink-0 select-none">
    <div className="stage-team-summary flex min-w-0 items-center gap-3">
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-inset ring-slate-100">
        <h2 className="text-sm font-bold text-slate-900 truncate">{currentTeam.name}</h2>
        <Badge className="shrink-0 bg-white text-slate-500 shadow-xs ring-1 ring-slate-200">{currentTeam.employees.length} 名助手</Badge>
      </div>
      {currentTeam.description.trim() && <><div className="h-4 w-px bg-slate-200" /><p className="hidden max-w-md truncate text-xs text-slate-400 lg:block">{currentTeam.description}</p></>}
    </div>
    <div className="flex shrink-0 items-center gap-3">
      <nav ref={capsuleRef} aria-label="工作视图" className="stage-view-capsule">
        <span aria-hidden="true" className="stage-view-capsule-indicator" style={{ width: indicator.width, transform: `translateX(${indicator.left - 4}px)`, opacity: indicator.visible ? 1 : 0 }} />
        <button type="button" aria-current={topology === 'roundTable' ? 'page' : undefined} onClick={() => setTopology('roundTable')}><CircleDot size={14} /><span>圆桌</span></button>
        <button type="button" aria-current={topology === 'workflowDag' ? 'page' : undefined} onClick={() => setTopology('workflowDag')}><GitFork size={14} /><span>工作流</span></button>
        <button type="button" aria-current={topology === 'teamManagement' ? 'page' : undefined} onClick={() => setTopology('teamManagement')}><Users size={14} /><span>团队</span></button>
        {enabledPlugins.length > 0 && <Select className="stage-plugin-select" label="选择团队插件" value={selectedPlugin.value} options={enabledPlugins.map(item => ({ ...item, icon: <Layers size={14} /> }))} aria-current={pluginSelected ? 'page' : undefined} onClick={event => {
          if (!pluginSelected) {
            event.preventDefault();
            activatePlugin(selectedPlugin.value);
          }
        }} onChange={activatePlugin}  />}
      </nav>
    </div>
  </header>;
}
