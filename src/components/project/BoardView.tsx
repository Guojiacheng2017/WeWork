import { DeleteWorkItemButton } from './DeleteWorkItemButton';
import { Button } from '../ui';
import { useEffect, useRef, useState } from 'react';
import type { CollaborationDatabase, CollaborationWorkItem } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';

type Drag = {id:string; statusId:string; startX:number; startY:number; x:number; y:number};
export function BoardView({ database, onUpdate, onOpen, onCreate, onDelete }: { database: CollaborationDatabase; onDelete:(id:string)=>void; onUpdate: (id: string, patch: Partial<CollaborationWorkItem>) => Promise<void>; onOpen:(id:string)=>void; onCreate:(statusId:string)=>void }) {
  const [drag,setDrag]=useState<Drag|null>(null); const live=useRef<Drag|null>(null);
  const [target,setTarget]=useState<string|null>(null); const update=useRef(onUpdate); update.current=onUpdate;
  const columnAt=(x:number,y:number)=>document.elementsFromPoint(x,y).map(e=>e.closest<HTMLElement>('[data-board-column]')?.dataset.boardColumn).find(Boolean);
  useEffect(()=>{
    const reset=()=>{live.current=null;setDrag(null);setTarget(null)};
    const move=(event:PointerEvent)=>{if(!live.current)return;const next={...live.current,x:event.clientX-live.current.startX,y:event.clientY-live.current.startY};live.current=next;setDrag(next);setTarget(columnAt(event.clientX,event.clientY)??null)};
    const finish=(event:PointerEvent)=>{const current=live.current;if(!current)return;const statusId=columnAt(event.clientX,event.clientY);reset();if(Math.abs(event.clientX-current.startX)+Math.abs(event.clientY-current.startY)>8&&statusId&&statusId!==current.statusId)void update.current(current.id,{statusId})};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')reset()};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',reset);window.addEventListener('blur',reset);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',reset);window.removeEventListener('blur',reset);window.removeEventListener('keydown',key)};
  },[]);
  return <div className="project-board">{projectViewModel(database).board.map(column=><section key={column.id} data-board-column={column.id} aria-label={`${column.name} 列`} className={target===column.id?'board-drop-target':''}><header><i style={{background:column.color}}/>{column.name}<small>{column.items.length}</small></header>{column.items.map(item=><article key={item.id} data-work-item={item.id} style={drag?.id===item.id?{transform:`translate(${drag.x}px,${drag.y}px)`,position:'relative',zIndex:10,pointerEvents:'none',boxShadow:'0 12px 30px #0f172a30'}:undefined}>
    <div className="flex items-start gap-2"><button type="button" aria-label={`拖动 ${item.title}`} className="board-drag-handle text-slate-400" onDragStart={e=>e.preventDefault()} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.closest<HTMLElement>('.project-board')?.setPointerCapture(event.pointerId);const current={id:item.id,statusId:item.statusId,startX:event.clientX,startY:event.clientY,x:0,y:0};live.current=current;setDrag(current)}}>⠿</button><button type="button" onClick={()=>onOpen(item.id)} className="flex-1 text-left font-semibold leading-5 text-slate-800 hover:text-sky-700">{item.title}</button><DeleteWorkItemButton title={item.title} onClick={()=>onDelete(item.id)}/></div>
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{item.priorityName}</span><span>{item.assigneeIds.map(id=>database.assignees.find(a=>a.id===id)?.displayName).filter(Boolean).join('、')||'未指派'}</span>{item.dueDate&&<time>{item.dueDate}</time>}</div>
  </article>)}<Button type="button" onClick={()=>onCreate(column.id)} className="mt-3 w-full rounded-lg px-2 py-2 text-left text-xs text-slate-500 hover:bg-white">＋ 新建工作项</Button></section>)}</div>;
}
