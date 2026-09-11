import type { ReactNode } from 'react';
import { CalendarRange, Columns3, ListChecks } from 'lucide-react';
import type { TeamView, WeWorkTeam } from '../../domain/wework';
import { useWeWorkStore } from '../../state/weworkStore';
import { projectPluginName, projectPluginViews } from './projectNavigation';

const icons = { issues: ListChecks, board: Columns3, gantt: CalendarRange };

export function ProjectPluginLayout({ team, view, children }: { team: WeWorkTeam; view: TeamView; children: ReactNode }) {
  const setTopology = useWeWorkStore(state => state.setTopology);
  const module = team.modules?.projectManagement;
  const views = projectPluginViews.filter(item => module?.enabled && module.capabilities.includes(item.value));
  return <div className="flex h-full min-h-0 min-w-0">
    <nav aria-label={`${projectPluginName(team)} 导航`} className="w-40 shrink-0 overflow-y-auto border-r border-slate-200/70 bg-white/60 p-3 lg:w-48">
      <h2 className="px-3 pb-4 pt-3 text-sm font-semibold text-slate-900">{projectPluginName(team)}</h2>
      <div className="flex flex-col gap-1">{views.map(item => {
        const Icon = icons[item.value];
        return <button key={item.value} type="button" aria-current={view === item.value ? 'page' : undefined} onClick={() => setTopology(item.value)} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${view === item.value ? 'bg-sky-50 font-medium text-sky-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}><Icon size={16} /><span>{item.label}</span></button>;
      })}</div>
    </nav>
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
  </div>;
}
