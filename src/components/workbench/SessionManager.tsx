import { useState } from 'react';
import { Dialog, Button } from '../ui';
import type { WeWorkEmployee } from '../../domain/wework';
import { MarkdownMessage } from '../common/MarkdownMessage';

/** Past contexts are read-only; the employee always has one current conversation. */
export function SessionManager({ employee }: { employee: WeWorkEmployee }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const history = employee.sessionHistory ?? [];
  const selected = history.find(session => session.id === selectedId);
  if (!history.length) return null;
  return <>
    <div className="flex shrink-0 justify-end border-b border-slate-100 px-4 py-2">
      <Button type="button" onClick={() => setOpen(true)}>查看历史对话</Button>
    </div>
    <Dialog open={open} onClose={() => { setOpen(false); setSelectedId(undefined); }} title="历史对话" description="历史仅供查看，不会切换或改变助手当前的对话。">
      <div className="max-h-[60vh] space-y-3 overflow-auto px-5 pb-5">
        {selected ? <><Button onClick={() => setSelectedId(undefined)}>返回历史列表</Button>
          {selected.messages.map(message => <div key={message.id} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="mb-2 font-semibold">{message.sender === 'user' ? '你' : message.sender === 'system' ? '执行记录' : employee.displayName}</p><MarkdownMessage>{message.text}</MarkdownMessage></div>)}
        </> : history.map((session, index) => <Button key={session.id} className="block w-full text-left" onClick={() => setSelectedId(session.id)}>
          <span className="block truncate">{session.messages.find(message => message.sender === 'user')?.text.slice(0, 60) || `历史对话 ${history.length - index}`}</span>
          <span className="text-xs text-slate-400">{session.messages.length} 条消息</span>
        </Button>)}
      </div>
    </Dialog>
  </>;
}
