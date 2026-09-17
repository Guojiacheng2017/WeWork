import { employeeSessions } from '../../domain/workbenchSessions';
import { ExecutionDetails } from '../common/ExecutionDetails';
import { MessageActions } from '../common/MessageActions';
import { memo } from 'react';
import { WeWorkEmployeeAvatar } from '../WeWorkEmployeeAvatar';
import { MarkdownMessage } from '../common/MarkdownMessage';
import type { WeWorkTeam } from '../../domain/wework';

export const TeamMessage = memo(function TeamMessage({ team, message, compact = false }: {
  compact?: boolean;
  team: WeWorkTeam;
  message: NonNullable<WeWorkTeam['teamMessages']>[number];
}) {
  const human = message.sender === 'user';
  const employee = human ? undefined : team.employees.find(item => item.id === message.senderId)
    ?? team.employees.find(item => item.displayName === message.senderName);
  const runId = message.sourceRunId ?? message.runtimeRunId;
  const lastReply = runId ? team.teamMessages?.filter(item => item.sender === 'employee' && (item.sourceRunId ?? item.runtimeRunId) === runId).at(-1) : undefined;
  const process = employee && runId && lastReply?.id === message.id
    ? employeeSessions(employee).flatMap(session => session.messages).filter(item => item.runtimeRunId === runId && item.sender !== 'user' && item.text !== message.text)
    : [];

  return <article
    className={`group/message flex w-full ${compact ? 'gap-2' : 'gap-3'} ${human ? 'justify-end' : ''}`}
    data-sender-kind={human ? 'human' : 'employee'}
  >
    {!human && <span className={`grid ${compact ? 'h-6 w-6' : 'h-8 w-8'} shrink-0 place-items-center`}>
      {employee ? <WeWorkEmployeeAvatar employee={employee} overview /> : <span className="text-xs">AI</span>}
    </span>}
    <div className={`min-w-0 ${human ? 'flex max-w-[85%] flex-col items-end' : 'flex-1'}`}>
      <div className={`flex flex-wrap items-center ${human ? 'justify-end' : ''} ${compact ? 'gap-x-1.5 gap-y-1' : 'gap-2'}`}>
        <strong className="text-[11px] text-slate-700">{human ? '你' : message.senderName ?? '助手'}</strong>
        {!human && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">AI 助手</span>}
      </div>
      {!human && <ExecutionDetails messages={process} endTime={message.time} />}
      <div className={`mt-1 min-w-0 max-w-full text-xs leading-5 ${human
        ? `rounded-2xl bg-[#e8f3ff] text-[#183653] ${compact ? 'px-3 py-2' : 'px-4 py-3'}`
        : 'text-slate-600'}`}>
        <MarkdownMessage>{message.text}</MarkdownMessage>
      </div>
      <MessageActions text={message.text} time={message.time} />
    </div>
  </article>;
});
