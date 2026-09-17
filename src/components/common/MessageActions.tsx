import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function MessageActions({ text, time }: { text: string; time: string }) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const copied = copiedText === text;
  return <div className="mt-2 flex flex-wrap items-center gap-1 text-slate-400 opacity-0 pointer-events-none transition-opacity group-hover/message:opacity-100 group-hover/message:pointer-events-auto group-focus-within/message:opacity-100 group-focus-within/message:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto" role="group" aria-label="消息操作">
    <button type="button" className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400" title={copied ? '已复制' : '复制消息'} aria-label={copied ? '已复制' : '复制消息'} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopiedText(text); setError(''); }
      catch { setError('复制失败，请重试'); }
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
    <time className="ml-2 text-[11px]" title={time}>{time.includes('T') ? new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : time}</time>
    <span role="status" className={error ? 'w-full text-[11px] text-rose-500' : 'sr-only'}>{error || (copied ? '消息已复制' : '')}</span>
  </div>;
}
