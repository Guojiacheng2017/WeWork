import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';

export function BoardView({ database, onUpdate }: { database: CollaborationDatabase; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => void }) {
  return <div className="project-board">{projectViewModel(database).board.map((column) => <section key={column.id}><header><i style={{ background: column.color }} />{column.name}<small>{column.items.length}</small></header>{column.items.map((item) => <article key={item.id}><strong>{item.title}</strong><select aria-label={`${item.title} 移动到`} value={item.statusId} onChange={(event) => onUpdate(item.id, { statusId: event.target.value })}>{database.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></article>)}</section>)}</div>;
}
