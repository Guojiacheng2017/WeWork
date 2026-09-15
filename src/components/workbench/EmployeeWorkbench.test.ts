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
