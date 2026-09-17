import type { MessageItem } from '../../domain/wework';

export type WorkbenchTimelineEntry = { kind: 'message'; message: MessageItem }
  | { kind: 'activity'; messages: MessageItem[]; endTime?: string };

export function groupWorkbenchTimeline(messages: MessageItem[]): WorkbenchTimelineEntry[] {
  const entries: WorkbenchTimelineEntry[] = [];
  for (let index = 0; index < messages.length;) {
    const message = messages[index];
    // A user intervention always splits the run, so later output never moves above it.
    const isRunOutput = (item: MessageItem) => item.sender === 'employee' || (item.sender === 'system' && ['tool', 'thinking'].includes(item.runtimeKind ?? ''));
    if (message.runtimeRunId && isRunOutput(message)) {
      const run: MessageItem[] = [];
      while (index < messages.length && messages[index].runtimeRunId === message.runtimeRunId && isRunOutput(messages[index])) {
        run.push(messages[index++]);
      }
      const final = [...run].reverse().find(item => item.sender === 'employee' && (!item.runtimeKind || item.runtimeKind === 'text'));
      const intermediate = run.filter(item => item !== final);
      if (intermediate.length) entries.push({ kind: 'activity', messages: intermediate, endTime: final?.time });
      if (final) entries.push({ kind: 'message', message: final });
      continue;
    }
    const activity = message.sender === 'system' && (message.runtimeKind === 'tool' || message.runtimeKind === 'thinking' || message.id.endsWith('-thinking'));
    const previous = entries.at(-1);
    if (!activity) entries.push({ kind: 'message', message });
    else if (previous?.kind === 'activity' && !previous.messages[0].runtimeRunId) previous.messages.push(message);
    else entries.push({ kind: 'activity', messages: [message] });
    index++;
  }
  return entries;
}
