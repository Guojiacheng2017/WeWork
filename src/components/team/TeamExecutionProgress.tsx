import { useEffect, useState } from 'react';
import type { MessageItem, WeWorkTeam } from '../../domain/wework';
import type { CollaborationDelivery } from '../../local/collaborationState';
import { employeeSessions } from '../../domain/workbenchSessions';
import { subscribeWeWorkRuntime } from '../../state/weworkStore';
import { ExecutionDetails } from '../common/ExecutionDetails';

export function TeamExecutionProgress({ team, delivery }: { team: WeWorkTeam; delivery: CollaborationDelivery }) {
  const [live, setLive] = useState<MessageItem[]>([]);
  useEffect(() => {
    setLive([]);
    return subscribeWeWorkRuntime(event => {
      if (event.runId !== delivery.runId || (event.type !== 'assistant.delta' && event.type !== 'assistant.activity')) return;
      const kind = event.type === 'assistant.delta' ? 'text' : event.activity;
      const id = crypto.randomUUID();
      setLive(previous => {
        const last = previous.at(-1);
        if (last?.runtimeKind === kind && kind === 'text') return [...previous.slice(0, -1), { ...last, text: last.text + event.text }];
        return [...previous, { id, sender: kind === 'text' ? 'employee' : 'system', text: event.text, time: new Date().toISOString(), runtimeRunId: event.runId, runtimeKind: kind }];
      });
    });
  }, [delivery.runId]);
  const employee = team.employees.find(item => item.id === delivery.employeeId);
  const saved = employee && delivery.runId ? employeeSessions(employee).flatMap(session => session.messages).filter(message => message.runtimeRunId === delivery.runId && message.sender !== 'user') : [];
  const messages = saved.length ? saved : live;
  return <article className="min-w-0 text-xs text-slate-500" aria-label={`${employee?.displayName ?? '助手'} 执行进度`}>
    <span className="text-[11px]">{employee?.displayName ?? '助手'} · {delivery.status === 'queued' ? '排队中' : '正在执行'}</span>
    {messages.length ? <ExecutionDetails messages={messages} running /> : <p role="status" className="mt-2 text-[11px] text-slate-400">{delivery.status === 'queued' ? '等待当前执行结束…' : '正在处理…'}</p>}
  </article>;
}
