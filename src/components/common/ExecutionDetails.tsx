import { ChevronRight } from 'lucide-react';
import type { MessageItem } from '../../domain/wework';
import { MarkdownMessage } from './MarkdownMessage';

export function ExecutionDetails({ messages, running = false, endTime }: {
  messages: MessageItem[]; running?: boolean; endTime?: string;
}) {
  if (!messages.length) return null;
  const start = Date.parse(messages[0].time);
  const end = Date.parse(endTime ?? messages.at(-1)!.time);
  const seconds = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : null;
  const elapsed = seconds === null || seconds === 0 ? '' : seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
  return <details className="group/execution my-3 min-w-0 text-xs text-slate-500">
    <summary className="flex cursor-pointer list-none items-center gap-2 border-b border-slate-200 py-2 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
      <span>{running ? '正在执行' : '执行过程'}{elapsed && ` · ${elapsed}`}</span>
      <ChevronRight size={14} className="transition-transform group-open/execution:rotate-90" />
    </summary>
    <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
      {messages.map(message => <li key={message.id} className="min-w-0">
        <span className="mb-1 block text-[10px] text-slate-400">{message.runtimeKind === 'tool' ? '工具活动' : '中间结果'}</span>
        <MarkdownMessage>{message.text.replace(/^思考\s*·\s*/, '')}</MarkdownMessage>
      </li>)}
    </ol>
  </details>;
}
