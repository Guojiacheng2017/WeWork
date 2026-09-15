import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Button } from '../ui';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, X } from 'lucide-react';
import type { DiagnosticSnapshot } from '../../runtime/weworkHost';

type DesktopDiagnostics = { diagnostics?: () => Promise<DiagnosticSnapshot>; clearDiagnostics?: () => Promise<DiagnosticSnapshot> };

export const RuntimeMonitor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dialogRef = useDialogFocus(true, onClose);
  const [showPolling, setShowPolling] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [paused, setPaused] = useState(false);
  const host = window.weworkHost as (typeof window.weworkHost & DesktopDiagnostics);
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!host?.diagnostics) { setError('监控台仅在 WeWork Desktop App 中可用'); return; }
    try { setSnapshot(await host.diagnostics()); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [host]);
  useEffect(() => { if (paused) return; void load(); const timer = window.setInterval(() => void load(), 1000); return () => window.clearInterval(timer); }, [load, paused]);
  const all = snapshot?.entries ?? [];
  const polling = (entry: typeof all[number]) => entry.level !== 'error' && entry.source === 'bridge' && /^events (开始|完成)$/.test(entry.message);
  const hidden = all.filter(polling).length;
  const entries = all.filter(entry => (showPolling || !polling(entry)) && (!onlyErrors || entry.level === 'error')).slice().reverse();
  return <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/20 p-4 sm:p-8 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="运行监控台"><section ref={dialogRef} tabIndex={-1} className="flex h-full w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl">
    <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">运行监控台</h2><p className="mt-1 text-[11px] text-slate-400">Host、Harness、Session 与桥接调用；敏感字段不会显示</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${snapshot?.status.host === 'ready' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>{snapshot?.status.host === 'ready' ? `Host 就绪 · PID ${snapshot.status.pid ?? '—'}` : 'Host 不可用'}</span><Button type="button" onClick={onClose} aria-label="关闭监控台" className="!p-0 grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"><X className="h-4 w-4" /></Button></header>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2"><Button type="button" onClick={() => void load()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"><RefreshCw className="h-3.5 w-3.5" />刷新</Button><Button type="button" onClick={async () => { try { if (host?.clearDiagnostics) setSnapshot(await host.clearDiagnostics()); } catch(reason) { setError(String(reason)); } }} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"><Trash2 className="h-3.5 w-3.5" />清空</Button><Button onClick={()=>setPaused(!paused)}>{paused?"继续更新":"暂停更新"}</Button></div><div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500"><p>本次保留 {all.length} 条 · 异常 {all.filter(entry=>entry.level==='error').length} 条 · {showPolling?'轮询已显示':`已折叠 ${hidden} 条正常轮询`}</p><div className="mt-3 flex gap-5"><label><input type="checkbox" checked={onlyErrors} onChange={e=>setOnlyErrors(e.target.checked)}/> 仅看异常</label><label><input type="checkbox" checked={showPolling} onChange={e=>setShowPolling(e.target.checked)}/> 显示轮询</label></div></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-5">{error && <p className="rounded-lg bg-rose-500/10 p-3 text-rose-700">{error}</p>}{!error && entries.length === 0 && <p className="p-3 text-slate-500">当前筛选下没有事件。可切换筛选或显示轮询记录。</p>}{entries.map((entry) => <article key={entry.id} className="mb-2 grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[18px_90px_70px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">{entry.level === 'error' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-rose-400" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-400" />}<time className="text-slate-500">{new Date(entry.time).toLocaleTimeString()}</time><span className="text-sky-700">{entry.source}</span><div className="min-w-0 break-words"><p className={entry.level === 'error' ? 'text-rose-700' : 'text-slate-700'}>{entry.message}</p>{entry.details && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">查看详情</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(entry.details,null,2)}</pre></details>}</div></article>)}</div>
  </section></div>;
};
