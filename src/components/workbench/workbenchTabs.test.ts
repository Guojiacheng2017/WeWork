import {expect,it} from 'vitest';
import {tabMessages,visibleGroupMessages,workbenchTabs} from './workbenchTabs';
import type {WeWorkEmployee,WeWorkTeam,MessageItem} from '../../domain/wework';
const employee={id:'e',displayName:'Worker',activeSession:{id:'private',messages:[{id:'private-note',text:'private'}],contextTagIds:['data']},workSessions:{w:{id:'work',title:'Analysis',messages:[{id:'work-note',text:'work'}]}}} as unknown as WeWorkEmployee;
const m=(id:string,extra:Partial<MessageItem>={}):MessageItem=>({id,sender:'user',text:id,time:'2026-09-10',...extra});
const team={employees:[employee],pendingWorks:[],teamMessages:[m('broadcast',{broadcast:true}),m('tagged',{contextTagIds:['data']}),m('hidden',{recipientId:'other'}),m('mine',{recipientId:'e'}),m('own',{senderId:'e',sender:'employee'})]} as unknown as WeWorkTeam;
it('shows private, group and historic work tabs with isolated messages',()=>{
 expect(workbenchTabs(employee,team).map(tab=>tab.id)).toEqual(['private','group','w']);
 expect(tabMessages(team,employee,'private').map(m=>m.text)).toEqual(['private']);
 expect(tabMessages(team,employee,'w').map(m=>m.text)).toEqual(['work']);
});
it('group tab includes exposed public, tagged, addressed and authored messages only',()=>{
 expect(visibleGroupMessages(team,employee).map(m=>m.id)).toEqual(['broadcast','tagged','mine','own']);
 expect(tabMessages(team,employee,'group').some(m=>['private-note','work-note','hidden'].includes(m.id))).toBe(false);
});
