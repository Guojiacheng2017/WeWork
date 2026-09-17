import { describe, expect, it } from 'vitest';
import { groupWorkbenchTimeline } from './workbenchTimeline';
import type { MessageItem } from '../../domain/wework';

const message=(id:string,sender:MessageItem['sender'],runtimeKind?:string):MessageItem=>({id,sender,text:id,time:'12:00',runtimeKind});

describe('groupWorkbenchTimeline',()=>{
  it('folds consecutive tool and thinking activity without hiding conversation messages',()=>{
    const entries=groupWorkbenchTimeline([message('a','employee'),message('t1','system','tool'),message('t2','system','thinking'),message('b','user'),message('notice','system')]);
    expect(entries.map(entry=>entry.kind)).toEqual(['message','activity','message','message']);
    expect(entries[1].kind==='activity'&&entries[1].messages).toHaveLength(2);
  });
});


describe('execution disclosure', () => {
  const runMessage = (id: string, sender: MessageItem['sender'], runtimeKind: string, runtimeRunId = 'run-1') => ({ ...message(id, sender, runtimeKind), runtimeRunId });
  it('keeps the latest response visible and folds earlier results with tools', () => {
    const entries = groupWorkbenchTimeline([runMessage('progress', 'employee', 'text'), runMessage('tool', 'system', 'tool'), runMessage('answer', 'employee', 'text')]);
    expect(entries.map(entry => entry.kind)).toEqual(['activity', 'message']);
    expect(entries[0].kind === 'activity' && entries[0].messages.map(item => item.id)).toEqual(['progress', 'tool']);
    expect(entries[1].kind === 'message' && entries[1].message.id).toBe('answer');
  });
  it('does not merge different runs or hide user interventions and status messages', () => {
    const entries = groupWorkbenchTimeline([
      runMessage('tool-1', 'system', 'tool'),
      message('steer', 'user'),
      runMessage('tool-2', 'system', 'tool'),
      runMessage('failure', 'system', 'status'),
      runMessage('tool-3', 'system', 'tool', 'run-2'),
    ]);
    expect(entries.map(entry => entry.kind)).toEqual(['activity', 'message', 'activity', 'message', 'activity']);
    expect(entries.flatMap(entry => entry.kind === 'activity' ? entry.messages : [entry.message]).map(item => item.id)).toEqual(['tool-1', 'steer', 'tool-2', 'failure', 'tool-3']);
  });
});
