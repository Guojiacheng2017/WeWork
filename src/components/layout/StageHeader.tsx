import React from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { CircleDot, GitFork, Users } from 'lucide-react';

export const StageHeader: React.FC = () => {
  const { teams, selectedTeamId, topology, setTopology } = useWeWorkStore();
  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  if (!currentTeam) return null;

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

      {/* Round table and DAG are peer work views. Team management is a separate section. */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-slate-100/90 p-1 rounded-lg border border-slate-200/80">
          <button
            onClick={() => setTopology('roundTable')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              topology === 'roundTable'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>圆桌视角</span>
          </button>
          <button
            onClick={() => setTopology('workflowDag')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              topology === 'workflowDag'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>流程 DAG</span>
          </button>
        </div>
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
