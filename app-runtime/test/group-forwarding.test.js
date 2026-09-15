import test from 'node:test';
import assert from 'node:assert/strict';
import {CollaborationCoordinator} from '../src/host/collaboration-coordinator.js';
test('busy group receives queued collaboration without starting another run',async()=>{
 const delivery={id:'new',employeeId:'e',status:'queued',messageId:'m'};
 const team={id:'t',teamMessages:[{id:'m',text:'Please review',senderName:'Reviewer'}],collaborationDeliveries:[delivery]};
 const calls=[];const api={snapshot:async()=>({teams:[team]}),forwardGroupDelivery:async(t,d,target,sent)=>{calls.push(sent?'sent':'reserved');delivery.status=sent?'running':'uncertain';delivery.runId='r';delivery.forwardingState=sent?'sent':'pending';}};
 const runtime={active:new Map([['r',{employeeId:'e',group:true,adapter:'pi',controls:{},deliveryId:'old'}]]),steerEmployee:async(e,text)=>{calls.push('steer');assert.match(text,/Please review/);return {accepted:true};}};
 const c=new CollaborationCoordinator({wework:{api,startRun:()=>assert.fail('duplicate run')},runtime});await c.tick();assert.deepEqual(calls,['reserved','steer','sent']);
});
test('ambiguous steering stays uncertain and cannot be replayed',async()=>{
 const d={id:'d',employeeId:'e',status:'queued',messageId:'m'};let attempts=0;
 const api={snapshot:async()=>({teams:[{id:'t',teamMessages:[{id:'m',text:'update'}],collaborationDeliveries:[d]}]}),forwardGroupDelivery:async()=>{d.status='uncertain';d.forwardingState='pending';d.runId='r';}};
 const runtime={active:new Map([['r',{employeeId:'e',group:true,adapter:'pi',controls:{},deliveryId:'old'}]]),steerEmployee:async()=>{attempts++;throw Error('disconnect');}};
 const c=new CollaborationCoordinator({wework:{api},runtime});await c.tick();await c.tick();assert.equal(attempts,1);assert.equal(d.status,'uncertain');
});
