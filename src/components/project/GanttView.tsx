import { DeleteWorkItemButton } from './DeleteWorkItemButton';
import { Input } from '../ui';
import { useState, type PointerEvent } from 'react';
import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';
import { dateNumber, dateString, shiftSchedule } from './ganttDates';
const DAY_WIDTH = 36;
export function GanttView({ database, onUpdate, onDelete }: { database: CollaborationDatabase; onDelete:(id:string)=>void; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => Promise<void> }) {
  const items = projectViewModel(database).issues;
  const [drag, setDrag] = useState<{id: string; x: number; days: number; resize: boolean; start: string; due: string} | null>(null);
  const dates = items.flatMap(item => [item.startDate, item.dueDate].filter(Boolean) as string[]).map(dateNumber).filter(Number.isFinite);
  const origin = (dates.length ? Math.min(...dates) : dateNumber(new Date().toISOString().slice(0,10))) - 2;
  const length = Math.max(21, (dates.length ? Math.max(...dates) : origin) - origin + 5);
  const startDrag = (event: PointerEvent<HTMLButtonElement>, item: CollaborationWorkItem, resize: boolean) => {
    if(event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({id:item.id,x:event.clientX,days:0,resize,start:item.startDate ?? item.dueDate!,due:item.dueDate ?? item.startDate!});
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => { if(drag) setDrag({...drag, days:Math.round((event.clientX-drag.x)/DAY_WIDTH)}); };
  const finish = () => { if(drag?.days) void onUpdate(drag.id,shiftSchedule(drag.start,drag.due,drag.days,drag.resize)); setDrag(null); };
  return <div className="project-gantt"><div className="gantt-axis">拖动日期条调整计划；拖动右侧手柄调整截止日期。每格一天。</div>{items.length === 0 && <p className="p-8 text-center text-xs text-slate-500">暂无工作项，请先创建 Issue。</p>}<div className="gantt-scroll"><div style={{minWidth: 260 + length * DAY_WIDTH}}><div className="gantt-calendar"><span>工作项 / 日期</span><div style={{width:length*DAY_WIDTH}}>{Array.from({length},(_,index)=><time key={index} style={{width:DAY_WIDTH}}>{dateString(origin+index).slice(5)}</time>)}</div></div>{items.map(item=> {
    const scheduled = !!(item.startDate || item.dueDate);
    const preview = drag?.id === item.id ? shiftSchedule(drag.start,drag.due,drag.days,drag.resize) : {startDate:item.startDate ?? item.dueDate,dueDate:item.dueDate ?? item.startDate};
    return <div className="gantt-timeline-row" key={item.id}><div className="gantt-item"><div className="flex items-center justify-between gap-2"><strong>{item.title}</strong><DeleteWorkItemButton title={item.title} onClick={()=>onDelete(item.id)}/></div><div><Input aria-label={`${item.title} 开始日期`} type="date" value={item.startDate ?? ''} onChange={event=>void onUpdate(item.id,{startDate:event.target.value || undefined})}/><Input aria-label={`${item.title} 截止日期`} type="date" value={item.dueDate ?? ''} onChange={event=>void onUpdate(item.id,{dueDate:event.target.value || undefined})}/></div></div><div className="gantt-track" style={{width:length*DAY_WIDTH}}>{scheduled ? <div className="gantt-bar" style={{left:(dateNumber(preview.startDate!)-origin)*DAY_WIDTH,width:Math.max(1,dateNumber(preview.dueDate!)-dateNumber(preview.startDate!)+1)*DAY_WIDTH}}><button type="button" aria-label={`移动 ${item.title} 日期`} title={`${preview.startDate} → ${preview.dueDate}`} onPointerDown={event=>startDrag(event,item,false)} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>setDrag(null)}>{item.title}</button><button type="button" aria-label={`调整 ${item.title} 截止日期`} onPointerDown={event=>startDrag(event,item,true)} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>setDrag(null)}>⋮</button></div> : <button className="m-3 text-xs text-sky-700" onClick={()=>void onUpdate(item.id,{startDate:dateString(origin+2),dueDate:dateString(origin+4)})}>＋ 设置计划</button>}</div></div>;
  })}</div></div></div>;
}
