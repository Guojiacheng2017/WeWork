import './project.css';
import { Dialog, DialogFooter, Button } from '../ui';
import { weworkApi } from '../../api/weworkApi';
import { Input } from '../ui';
import { useEffect, useRef, useState } from 'react';
import type { TeamView, WeWorkTeam } from '../../domain/wework';
import type { CollaborationWorkItem } from '../../domain/collaboration';
import { useWeWorkStore } from '../../state/weworkStore';
import { IssuesView } from './IssuesView';
import { BoardView } from './BoardView';
import { ProjectItemDetail } from './ProjectItemDetail';
import { ProjectTransfer } from './ProjectTransfer';
import { weworkMode } from '../../api/weworkApi';
import { GanttView } from './GanttView';

export default function ProjectManagementView({ team, view }: { team: WeWorkTeam; view: TeamView }) {
  const { createProjectWorkItem, updateProjectWorkItem } = useWeWorkStore();
  const [deleting,setDeleting]=useState<string|null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const [selected,setSelected]=useState<string|null>(null);
  const [createStatus,setCreateStatus]=useState<string|null>(null);
  const [title,setTitle]=useState('');
  useEffect(()=>{setSelected(null);setCreateStatus(null)},[team.id]);
  const database = team.collaborationDatabase ? {...team.collaborationDatabase,assignees:[...team.collaborationDatabase.assignees,...team.employees.filter(e=>!team.collaborationDatabase!.assignees.some(a=>a.employeeId===e.id)).map(e=>({id:e.id,employeeId:e.id,displayName:e.displayName}))]} : undefined;
  if (!database) return <div className="grid h-full place-items-center text-sm text-slate-500">项目协作数据尚未初始化</div>;
  const save = (operation: () => Promise<void>) => {
    pending.current += 1; setSaving(true); setFeedback('正在保存…'); setError('');
    const result = saveQueue.current.then(async()=>{
      try { await operation(); setFeedback('已保存'); return true; }
      catch(error) { setFeedback(''); setError(error instanceof Error ? error.message : '保存失败，请重试'); return false; }
      finally { pending.current -= 1; if(!pending.current) setSaving(false); }
    });
    saveQueue.current = result.then(()=>{});
    return result;
  };
  const update = async (id: string, patch: Partial<CollaborationWorkItem>) => {
    await save(async()=>{
      const current = useWeWorkStore.getState().teams.find(candidate=>candidate.id===team.id)?.collaborationDatabase;
      const item = {...current?.workItems.find(item=>item.id===id),...patch};
      if(item.startDate && item.dueDate && item.startDate > item.dueDate) throw new Error('截止日期不能早于开始日期');
      await updateProjectWorkItem(team.id,id,patch);
    });
  };
  return <section className="project-workspace relative flex h-full min-w-0 overflow-hidden"><div className="project-page min-w-0 flex-1 overflow-auto"><div className="project-page-inner"><h3 className="mb-1 text-lg font-bold text-slate-900">{database.projects[0]?.name}</h3><p className="mb-3 text-xs text-slate-500">工作项、看板与甘特图保持同步，修改后自动保存。</p>{weworkMode==='local'&&<ProjectTransfer key={team.id} teamId={team.id} database={database}/>}<div className="mb-2 text-xs">{error ? <p role="alert" className="text-rose-600">{error}</p> : <p role="status" className="text-emerald-700">{feedback}</p>}</div>{createStatus && <form className="project-create mb-4" onSubmit={async e=>{e.preventDefault();if(!title.trim())return;const success=await save(async()=>{await createProjectWorkItem(team.id,title.trim(),createStatus)});if(success){setCreateStatus(null);setTitle('')}}}><Input autoFocus aria-label="新工作项标题" value={title} onChange={e=>setTitle(e.target.value)} placeholder="工作项名称"/><button disabled={saving||!title.trim()}>添加</button><button type="button" onClick={()=>setCreateStatus(null)}>取消</button></form>}<fieldset disabled={saving} aria-busy={saving} className="min-w-0">{view === 'issues' ? <IssuesView onDelete={setDeleting} employees={team.employees} onOpen={setSelected} database={database} onCreate={title=>save(()=>createProjectWorkItem(team.id,title))} onUpdate={update} /> : view === 'board' ? <BoardView onDelete={setDeleting} database={database} onUpdate={update} onOpen={setSelected} onCreate={setCreateStatus} /> : <GanttView onDelete={setDeleting} database={database} onUpdate={update} />}</fieldset></div></div>{selected && database.workItems.find(item=>item.id===selected) && <ProjectItemDetail onDelete={setDeleting} key={selected} item={database.workItems.find(item=>item.id===selected)!} database={database} onUpdate={update} onClose={()=>setSelected(null)}/>}<Dialog open={Boolean(deleting)} onClose={()=>setDeleting(null)} title="删除工作项" description={`确定删除“${database.workItems.find(item=>item.id===deleting)?.title??''}”？相关评论和关联关系也会删除。`} busy={saving}><DialogFooter><Button type="button" disabled={saving} onClick={()=>setDeleting(null)}>取消</Button><Button type="button" variant="primary" disabled={saving} onClick={async()=>{if(!deleting)return;const id=deleting;const success=await save(async()=>{await weworkApi.deleteCollaborationWorkItem(team.id,id);await useWeWorkStore.getState().hydrate()});if(success){setDeleting(null);if(selected===id)setSelected(null);setFeedback('工作项已删除')}}}>{saving?'删除中…':'确认删除'}</Button></DialogFooter>{error&&<p role="alert" className="px-5 pb-4 text-xs text-rose-600">{error}</p>}</Dialog></section>;
}
