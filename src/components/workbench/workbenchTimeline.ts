import type { MessageItem } from '../../domain/wework';

export type WorkbenchTimelineEntry = { kind:'message'; message:MessageItem } | { kind:'activity'; messages:MessageItem[] };

export function groupWorkbenchTimeline(messages:MessageItem[]):WorkbenchTimelineEntry[] {
  return messages.reduce<WorkbenchTimelineEntry[]>((entries,message)=>{
    const activity=message.sender==='system' && (message.runtimeKind==='tool'||message.runtimeKind==='thinking'||message.id.endsWith('-thinking'));
    if(!activity){entries.push({kind:'message',message});return entries;}
    const previous=entries.at(-1);
    if(previous?.kind==='activity') previous.messages.push(message); else entries.push({kind:'activity',messages:[message]});
    return entries;
  },[]);
}
