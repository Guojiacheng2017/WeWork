import { Button } from '../ui';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WeWorkEmployee } from '../../domain/wework';

export function SessionContextSummary({session}:{session:WeWorkEmployee['activeSession']}) {
 const [expanded,setExpanded]=useState(false);const detailsId=useId();
 const measured=Boolean(session.contextMeasuredAt);
 const context=session.metrics.find(m=>m.label==='Context tokens');
 const used=measured?context?.value:undefined;
 const limit=context?.maximum;
 const percent=measured?session.contextRatio:undefined;
 const format=(n:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
 const usage=session.metrics.filter(m=>['Input tokens','Output tokens','Cache read','Cache write'].includes(m.label));
 const labels:Record<string,string>={'Input tokens':'输入','Output tokens':'输出','Cache read':'缓存读取','Cache write':'缓存写入'};
 return <div className="text-xs">
  <div className="flex items-center justify-between gap-3"><strong className="text-slate-800">Context window</strong><span className="tabular-nums text-slate-500">{used!==undefined&&limit?`${format(used)} / ${format(limit)} (${percent}%)`:'尚未上报'}</span></div>
  <div className="my-3 flex h-2 overflow-hidden rounded bg-slate-100"><span className="bg-sky-500" style={{width:`${Math.min(100,Math.max(0,percent??0))}%`}}/></div>
  <div className="flex justify-between py-1"><span className="text-slate-600">当前上下文占用</span><span className="tabular-nums">{used===undefined?'—':format(used)}</span></div>
  <div className="flex justify-between py-1"><span className="text-slate-600">剩余可用</span><span className="tabular-nums">{used!==undefined&&limit?format(Math.max(0,limit-used)):'—'}</span></div>
  <p className="mt-2 text-[11px] leading-4 text-slate-400">Harness 尚未提供消息、系统提示、工具及技能的独立占用明细。占用值以最近一次上报为准。</p>
  <div className="mt-3 border-t border-slate-100 pt-2"><Button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(!expanded)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-slate-600 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400"><span>调用用量与会话信息</span><ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${expanded?'rotate-180':''}`}/></Button><div id={detailsId} hidden={!expanded} className="mt-2 space-y-1.5 px-2 text-[11px]">{usage.map(m=><div key={m.label} className="flex justify-between"><span>{labels[m.label]}</span><span className="tabular-nums">{format(m.value)} tokens</span></div>)}<div className="flex justify-between"><span>会话消息</span><span>{session.messages.length} 条</span></div><p className="text-[11px] text-slate-400">调用用量不等同于当前上下文占用。</p></div></div>
 </div>;
}
