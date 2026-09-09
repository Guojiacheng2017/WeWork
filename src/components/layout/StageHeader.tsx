import { useLayoutEffect, useRef } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { CalendarRange, CircleDot, Columns3, GitFork, ListChecks, Users } from 'lucide-react';
import { Badge, Button, ViewSwitcher } from '../ui';
import type { TeamView } from '../../domain/wework';

export function StageHeader() {
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
  const projectViews = [
    { capability: 'issues', value: 'issues', label: '工作项', icon: <ListChecks size={14} /> },
    { capability: 'board', value: 'board', label: '看板', icon: <Columns3 size={14} /> },
    { capability: 'gantt', value: 'gantt', label: '甘特图', icon: <CalendarRange size={14} /> },
  ] as const;
  const availableProjectViews = projectViews.filter(view => capabilities.has(view.capability));
  return <header ref={headerRef} className="wework-stage-header h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between z-10 shrink-0 select-none">
    <div className="stage-team-summary flex min-w-0 items-center gap-3">
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-inset ring-slate-100">
        <h2 className="text-sm font-bold text-slate-900 truncate">{currentTeam.name}</h2>
        <Badge className="shrink-0 bg-white text-slate-500 shadow-xs ring-1 ring-slate-200">{currentTeam.employees.length} 名助手</Badge>
      </div>
      {currentTeam.description.trim() && <><div className="h-4 w-px bg-slate-200" /><p className="hidden max-w-md truncate text-xs text-slate-400 lg:block">{currentTeam.description}</p></>}
    </div>
    <div className="flex shrink-0 items-center gap-3">
      <Button type="button" variant={topology === 'roundTable' ? 'secondary' : 'ghost'}
        aria-current={topology === 'roundTable' ? 'page' : undefined} onClick={() => setTopology('roundTable')}>
        <CircleDot size={14} /><span>圆桌</span>
      </Button>
      <Button type="button" variant={topology === 'workflowDag' ? 'secondary' : 'ghost'}
        aria-current={topology === 'workflowDag' ? 'page' : undefined} onClick={() => setTopology('workflowDag')}>
        <GitFork size={14} /><span>工作流</span>
      </Button>
      {availableProjectViews.length > 0 && <><span className="h-5 w-px bg-slate-200" /><ViewSwitcher<TeamView> label="项目管理插件" value={topology} onChange={setTopology} items={availableProjectViews} /></>}
      <span className="h-5 w-px bg-slate-200" />
      <Button type="button" variant={topology === 'teamManagement' ? 'secondary' : 'ghost'}
        aria-current={topology === 'teamManagement' ? 'page' : undefined} onClick={() => setTopology('teamManagement')}>
        <Users size={14} /><span>团队管理</span>
      </Button>
    </div>
  </header>;
}
