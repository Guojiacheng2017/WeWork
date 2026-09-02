import type { TeamView, WeWorkTeam } from '../../domain/wework';
import type { CollaborationWorkItem } from '../../domain/collaboration';
import { useWeWorkStore } from '../../state/weworkStore';
import { IssuesView } from './IssuesView'; import { BoardView } from './BoardView'; import { GanttView } from './GanttView';

export default function ProjectManagementView({ team, view }: { team: WeWorkTeam; view: TeamView }) {
  const { createProjectWorkItem, updateProjectWorkItem } = useWeWorkStore(); const database = team.collaborationDatabase;
  if (!database) return <div className="grid h-full place-items-center text-sm text-slate-500">项目协作数据尚未初始化</div>;
  const update = (id: string, patch: Partial<CollaborationWorkItem>) => void updateProjectWorkItem(team.id, id, patch);
  return <section className="h-full overflow-auto p-6"><div className="mx-auto max-w-6xl"><h3 className="mb-1 text-lg font-bold text-slate-900">{database.projects[0]?.name}</h3><p className="mb-5 text-xs text-slate-500">Issues、Board 与 Gantt 共享同一组工作项。</p>{view === 'issues' ? <IssuesView database={database} onCreate={(title) => void createProjectWorkItem(team.id, title)} onUpdate={update} /> : view === 'board' ? <BoardView database={database} onUpdate={update} /> : <GanttView database={database} onUpdate={update} />}</div></section>;
}
