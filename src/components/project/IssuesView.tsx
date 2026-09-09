import { DeleteWorkItemButton } from './DeleteWorkItemButton';
import { Button, Input, NativeSelect, Textarea } from '../ui';
import { Select as AppSelect } from '../ui';
import { useState } from 'react';
import { CalendarDays, CircleDot, UserRound } from 'lucide-react';
import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { WeWorkEmployeeAvatar } from '../WeWorkEmployeeAvatar';
import type { WeWorkEmployee } from '../../domain/wework';
import { projectViewModel } from './projectViewModel';

const withAlpha = (color: string, alpha: string) => /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;

export function IssuesView({ database, employees, onCreate, onUpdate, onOpen, onDelete }: { database: CollaborationDatabase; onDelete:(id:string)=>void; employees: WeWorkEmployee[]; onOpen:(id:string)=>void; onCreate: (title: string) => Promise<boolean>; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => void }) {
  const [title,setTitle]=useState('');const [query,setQuery]=useState('');const [status,setStatus]=useState('');
  const items=projectViewModel(database).issues.filter(item=>(!status||item.statusId===status)&&`${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="project-view"><form onSubmit={async event=>{event.preventDefault();if(title.trim()&&await onCreate(title.trim()))setTitle('')}} className="project-create"><Input aria-label="工作项标题" value={title} onChange={e=>setTitle(e.target.value)} placeholder="新建工作项"/><Button disabled={!title.trim()}>创建</Button></form><div className="project-filters mb-3 flex flex-wrap gap-2"><Input type="search" aria-label="搜索工作项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索标题或正文" className="px-3 py-2"/><NativeSelect aria-label="筛选工作项状态" value={status} onChange={e=>setStatus(e.target.value)} className="px-3 py-2"><option value="">全部状态</option>{database.statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></div>
  <div className="project-table"><div className="project-row project-head"><span>工作项</span><span>状态</span><span>负责人</span><span>优先级</span><span>截止</span><span>说明与下一步</span><span className="sr-only">操作</span></div>{items.map(item=>{
    const itemStatus=database.statuses.find(value=>value.id===item.statusId);
    const priority=database.priorities.find(value=>value.id===item.priorityId);
    const overdue=Boolean(item.dueDate&&item.dueDate<new Date().toISOString().slice(0,10)&&itemStatus?.category!=='completed');
    return <div className="project-row" key={item.id}>
      <button type="button" onClick={()=>onOpen(item.id)} className="flex items-center gap-2 text-left font-semibold text-slate-800 hover:text-sky-700"><CircleDot className="h-4 w-4 shrink-0 text-sky-500"/><span className="truncate">{item.title}</span></button>
      <label className="project-colored-field" style={{color:itemStatus?.color,backgroundColor:withAlpha(itemStatus?.color??'#64748b','14'),borderColor:withAlpha(itemStatus?.color??'#64748b','35')}}><AppSelect label={`${item.title} 状态`} value={item.statusId} onChange={value=>onUpdate(item.id,{statusId:value})} options={database.statuses.map(s=>({value:s.id,label:s.name,icon:<span className="h-2 w-2 rounded-full" style={{backgroundColor:s.color}}/>}))}/></label>
      <div className="project-colored-field border-sky-200 bg-sky-50 text-sky-800"><AppSelect label={`${item.title} 负责人`} value={item.assigneeIds[0]??''} onChange={value=>onUpdate(item.id,{assigneeIds:value?[value]:[]})} options={[{value:'',label:'未指派',icon:<UserRound className="h-5 w-5 shrink-0"/>},...database.assignees.map(a=>{const person=employees.find(e=>e.id===(a.employeeId??a.id));return {value:a.id,label:a.displayName,icon:person?<span className="h-6 w-6 shrink-0"><WeWorkEmployeeAvatar employee={person} overview/></span>:<UserRound className="h-5 w-5 shrink-0"/>}})]}/></div>
      <label className="project-colored-field" style={{color:priority?.color,backgroundColor:withAlpha(priority?.color??'#64748b','14'),borderColor:withAlpha(priority?.color??'#64748b','35')}}><AppSelect label={`${item.title} 优先级`} value={item.priorityId} onChange={value=>onUpdate(item.id,{priorityId:value})} options={database.priorities.map(p=>({value:p.id,label:p.name,icon:<span className="h-2 w-2 rotate-45" style={{backgroundColor:p.color}}/>}))}/></label>
      <label className={`project-colored-field ${overdue?'border-rose-200 bg-rose-50 text-rose-700':'border-violet-200 bg-violet-50 text-violet-700'}`}><CalendarDays className="h-3.5 w-3.5 shrink-0"/><Input aria-label={`${item.title} 截止日期`} type="date" value={item.dueDate??''} onChange={e=>onUpdate(item.id,{dueDate:e.target.value||undefined})}/></label>
      <Textarea key={`${item.id}-${item.updatedAt}`} aria-label={`${item.title} 说明与下一步`} defaultValue={item.description} placeholder="添加说明…" rows={1} onBlur={e=>{if(e.target.value!==item.description)onUpdate(item.id,{description:e.target.value})}} className="project-description"/><DeleteWorkItemButton title={item.title} onClick={()=>onDelete(item.id)}/>
    </div>})}</div>{!items.length&&<p role="status" className="p-6 text-center text-xs text-slate-400">{query||status?'没有匹配的工作项':'创建第一个工作项，开始安排项目。'}</p>}</div>;
}
