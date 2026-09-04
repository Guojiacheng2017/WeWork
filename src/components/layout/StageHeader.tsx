import React from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { CalendarRange, CircleDot, Columns3, GitFork, ListChecks, Users } from 'lucide-react';

export const StageHeader: React.FC = () => {
  const { teams, selectedTeamId, topology, setTopology } = useWeWorkStore();
  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  if (!currentTeam) return null;

  const project = currentTeam.modules?.projectManagement;
  const capabilities = new Set(project?.enabled ? project.capabilities : []);
  return (
    <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between z-10 shrink-0 select-none">
      {/* Left: Team Title & Meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900 truncate">{currentTeam.name}</h2>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
            {currentTeam.employees.length} 名助手
          </span>
        </div>
        <div className="h-3 w-px bg-slate-200" />
        <p className="text-xs text-slate-400 truncate hidden lg:block max-w-md">
          {currentTeam.description}
        </p>
      </div>

      {/* The round table is the permanent team home. Project views are optional modules. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTopology('roundTable')}
          aria-current={topology === 'roundTable' ? 'page' : undefined}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            topology === 'roundTable'
              ? 'border-slate-300 bg-white text-slate-900 shadow-sm'
              : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'
          }`}
        >
          <CircleDot className="h-3.5 w-3.5" />
          <span>圆桌</span>
        </button>
        {capabilities.size > 0 && <div aria-label="协作模块" className="flex items-center bg-slate-100/90 p-1 rounded-lg border border-slate-200/80">
          {capabilities.has('issues') && <button onClick={() => setTopology('issues')} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold ${topology === 'issues' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}><ListChecks className="h-3.5 w-3.5" />Issues</button>}
          {capabilities.has('board') && <button onClick={() => setTopology('board')} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold ${topology === 'board' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}><Columns3 className="h-3.5 w-3.5" />Board</button>}
          {capabilities.has('gantt') && <button onClick={() => setTopology('gantt')} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold ${topology === 'gantt' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}><CalendarRange className="h-3.5 w-3.5" />Gantt</button>}
          {capabilities.has('dag') && <button
            onClick={() => setTopology('workflowDag')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              topology === 'workflowDag'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>流程 DAG</span>
          </button>}
        </div>}
        <span className="h-5 w-px bg-slate-200" />
        <button
          onClick={() => setTopology('teamManagement')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            topology === 'teamManagement'
              ? 'border-slate-300 bg-white text-slate-900 shadow-sm'
              : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>团队管理</span>
        </button>
      </div>
    </header>
  );
};
