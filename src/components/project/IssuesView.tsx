import { useState } from 'react';
import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';

export function IssuesView({ database, onCreate, onUpdate }: { database: CollaborationDatabase; onCreate: (title: string) => void; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => void }) {
  const [title, setTitle] = useState(''); const model = projectViewModel(database);
  return <div className="project-view"><form onSubmit={(event) => { event.preventDefault(); if (title.trim()) { onCreate(title.trim()); setTitle(''); } }} className="project-create"><input aria-label="Issue 标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新建 Issue" /><button>创建</button></form><div className="project-table"><div className="project-row project-head"><span>Issue</span><span>状态</span><span>优先级</span><span>截止</span></div>{model.issues.map((item) => <div className="project-row" key={item.id}><strong>{item.title}</strong><select aria-label={`${item.title} 状态`} value={item.statusId} onChange={(event) => onUpdate(item.id, { statusId: event.target.value })}>{database.statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select><span>{item.priorityName}</span><input aria-label={`${item.title} 截止日期`} type="date" value={item.dueDate ?? ''} onChange={(event) => onUpdate(item.id, { dueDate: event.target.value || undefined })} /></div>)}</div></div>;
}
