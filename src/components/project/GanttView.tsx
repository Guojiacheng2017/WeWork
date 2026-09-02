import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';

export function GanttView({ database, onUpdate }: { database: CollaborationDatabase; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => void }) {
  const items = projectViewModel(database).issues;
  return <div className="project-gantt"><div className="gantt-axis">时间计划 · 所有日期写回统一 Collaboration Database</div>{items.map((item) => <div className="gantt-row" key={item.id}><strong>{item.title}</strong><label>开始<input type="date" value={item.startDate ?? ''} onChange={(event) => onUpdate(item.id, { startDate: event.target.value || undefined })} /></label><span>→</span><label>截止<input type="date" value={item.dueDate ?? ''} onChange={(event) => onUpdate(item.id, { dueDate: event.target.value || undefined })} /></label></div>)}</div>;
}
