import { Button } from '../ui';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, X } from 'lucide-react';
import type { DiagnosticSnapshot } from '../../runtime/weworkHost';

type DesktopDiagnostics = { diagnostics?: () => Promise<DiagnosticSnapshot>; clearDiagnostics?: () => Promise<DiagnosticSnapshot> };

export const RuntimeMonitor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const host = window.weworkHost as (typeof window.weworkHost & DesktopDiagnostics);
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!host?.diagnostics) { setError('监控台仅在 WeWork Desktop App 中可用'); return; }
    try { setSnapshot(await host.diagnostics()); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [host]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 1000); return () => window.clearInterval(timer); }, [load]);
  const entries = snapshot?.entries.slice().reverse() ?? [];
  return <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="运行监控台"><section className="flex h-full w-full max-w-2xl flex-col bg-slate-950 text-slate-100 shadow-2xl">
    <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-4"><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">运行监控台</h2><p className="mt-1 text-[11px] text-slate-400">Host、Harness、Session 与桥接调用；敏感字段不会显示</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${snapshot?.status.host === 'ready' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{snapshot?.status.host === 'ready' ? `Host 就绪 · PID ${snapshot.status.pid ?? '—'}` : 'Host 不可用'}</span><Button type="button" onClick={onClose} aria-label="关闭监控台" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-800"><X className="h-4 w-4" /></Button></header>
    <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-2"><Button type="button" onClick={() => void load()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" />刷新</Button><Button type="button" onClick={async () => { if (host?.clearDiagnostics) setSnapshot(await host.clearDiagnostics()); }} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"><Trash2 className="h-3.5 w-3.5" />清空</Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-5">{error && <p className="rounded-lg bg-rose-500/10 p-3 text-rose-300">{error}</p>}{!error && entries.length === 0 && <p className="p-3 text-slate-500">暂无事件。发送消息或启动任务后，这里会显示执行阶段。</p>}{entries.map((entry) => <article key={entry.id} className="mb-2 grid grid-cols-[18px_90px_70px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">{entry.level === 'error' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-rose-400" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-400" />}<time className="text-slate-500">{new Date(entry.time).toLocaleTimeString()}</time><span className="text-sky-300">{entry.source}</span><div className="min-w-0 break-words"><p className={entry.level === 'error' ? 'text-rose-200' : 'text-slate-200'}>{entry.message}</p>{entry.details && <pre className="mt-1 whitespace-pre-wrap text-slate-500">{JSON.stringify(entry.details)}</pre>}</div></article>)}</div>
  </section></div>;
};
