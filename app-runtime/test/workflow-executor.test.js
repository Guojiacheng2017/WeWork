import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeWorkService, FileWeWorkStorage } from '../src/host/wework-service.js';
import { RuntimeManager } from '../src/host/runtime-manager.js';
import { CheckpointStore } from '../src/host/checkpoint-store.js';
import { WorkflowSupervisor } from '../src/host/workflow-supervisor.js';
import { WorkflowExecutor } from '../src/host/workflow-executor.js';
async function setup(t, behavior='submit', started=true) {
 const root=await mkdtemp(join(tmpdir(),'workflow-executor-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const storage=new FileWeWorkStorage(join(root,'state.json'));
 const service=new WeWorkService(storage,{currentWorkspace:async()=>({kind:'local',rootPath:root})});
 const team=await service.api.createTeam({name:'Execution test',runtime:'Workspace'});
 const profile=await service.api.createRuntimeProfile({name:'Fixture',adapter:'pi',model:{provider:'pi',modelId:'default'},thinkingLevel:'off',enabled:true,systemPrompt:''});
 const members=[];for(let i=0;i<2;i++) members.push(await service.api.addEmployee(team.id,{displayName:`E${i}`,roleName:'Analyst',runtime:'Pi',defaultRuntimeProfileId:profile.id}));
 await service.api.saveWorkflow(team.id,{id:'flow',name:'Flow',description:'',nodes:members.map((e,i)=>({id:`n${i}`,label:`N${i}`,roleName:'Analyst',assignedEmployeeId:e.id,requires:i?['n0']:[],inputBindings:i?[{sourceNodeId:'n0',documentTitles:['Result'],includeSummary:false}]:[],status:i?'waiting':'ready',stepNumber:i+1}))});
 if(started) await service.api.startWorkflow(team.id);
 const executions=[];const store=new CheckpointStore(join(root,'runtime'));
 const runtime=new RuntimeManager({store,journal:{publish(){}},execute:async spec=>{
  executions.push(spec);
  if(behavior==='fail')throw new Error('provider unavailable');
  if(behavior==='submit') {const doc=await service.api.saveWorkDocument(spec.workId,{title:'Result',kind:'output',content:`Evidence from ${spec.work.title}`},{employeeId:spec.employeeId,runId:spec.id});await service.api.submitDeliverable(spec.workId,{summary:'Done',documentIds:[doc.id],evidence:'Fixture checked'},{employeeId:spec.employeeId,runId:spec.id});}
  return {messages:[],finalText:'Finished'};
 },onFinish:(...args)=>service.finish(...args)});
 return {root,storage,service,team,members,runtime,executions,store,executor:new WorkflowExecutor({wework:service,runtime})};
}
async function settle(runtime) {await Promise.all([...runtime.active.values()].map(x=>x.done));}
test('production dependency propagation preserves source documents, submissions and restart idempotency',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);assert.equal(f.executions.length,1);
 const reopened=new WeWorkService(f.storage,{currentWorkspace:async()=>({kind:'local',rootPath:f.root})});
 const executor=new WorkflowExecutor({wework:reopened,runtime:f.runtime});
 await executor.tick(f.team.id,'flow');await settle(f.runtime);
 assert.equal(f.executions.length,2);
 const context=await reopened.api.getWorkContext(f.executions[1].workId);
 const input=context.documents.find(d=>d.sourceNodeId==='n0');assert.ok(input);
 assert.equal((await reopened.api.readWorkDocument(f.executions[1].workId,input.id)).content,'Evidence from N0');
 assert.ok(input.sourceWorkId);assert.ok(input.sourceDocumentId);
 assert.equal((await executor.tick(f.team.id,'flow')).status,'completed');
 await executor.tick(f.team.id,'flow');assert.equal(f.executions.length,2);
 const state=await reopened.api.snapshot();for(const e of state.teams[0].employees)for(const w of e.completedWorkItems??[]){assert.equal(w.deliveryStatus,'submitted');assert.equal(w.records.reviews.length,0);}
});
test('failed upstream is durable and never starts downstream or retries on restart',async t=>{
 const f=await setup(t,'fail');await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const result=await new WorkflowExecutor({wework:f.service,runtime:f.runtime}).tick(f.team.id,'flow');
 assert.equal(result.status,'blocked');assert.equal(f.executions.length,1);assert.match(result.blockers[0].reason,/failed/);
 const state=await f.service.api.snapshot();assert.equal(state.teams[0].workflow.nodes[1].status,'waiting');
});
test('successful process without submission cannot unlock a dependent',async t=>{
 const f=await setup(t,'empty');await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const result=await f.executor.tick(f.team.id,'flow');assert.equal(result.status,'blocked');assert.match(result.blockers[0].reason,/submission/);assert.equal(f.executions.length,1);
});
test('parallel tick calls do not launch duplicate runs',async t=>{
 const f=await setup(t);await Promise.all([f.executor.tick(f.team.id,'flow'),f.executor.tick(f.team.id,'flow')]);await settle(f.runtime);assert.equal(new Set(f.executions.map(s=>s.workId)).size,f.executions.length);
});
test('persisted nonterminal run without a live owner is uncertain and not replayed',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const id=f.executions[0].id;const run=await f.store.getRun(id);await f.store.putRun({...run,status:'running'});
 const result=await f.executor.tick(f.team.id,'flow');assert.equal(result.status,'blocked');assert.match(result.blockers[0].reason,/uncertain/);assert.equal(f.executions.length,1);
});
test('cancelled upstream is not advanced even when a submission exists',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const run=await f.store.getRun(f.executions[0].id);await f.store.putRun({...run,status:'cancelled'});
 const result=await f.executor.tick(f.team.id,'flow');assert.equal(result.status,'blocked');assert.equal(result.blockers[0].reason,'cancelled');assert.equal(f.executions.length,1);
});
test('reconstructed Runtime resumes durable success without replaying completed employee',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const replacement=new RuntimeManager({store:f.store,journal:{publish(){}},execute:f.runtime.execute,onFinish:f.runtime.onFinish});
 const executor=new WorkflowExecutor({wework:f.service,runtime:replacement});
 await executor.tick(f.team.id,'flow');await settle(replacement);assert.equal(f.executions.length,2);
 assert.equal((await executor.tick(f.team.id,'flow')).status,'completed');assert.equal(f.executions.filter(s=>s.work.title==='N0').length,1);
});
test('submission made by another run cannot advance the current execution',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const state=JSON.parse(f.storage.getItem());state.teams[0].employees.find(e=>e.currentWorkItem?.workflowNodeId==='n0').currentWorkItem.records.deliverables[0].actor.runId='different-run';f.storage.setItem('',JSON.stringify(state));
 const result=await f.executor.tick(f.team.id,'flow');assert.equal(result.status,'blocked');assert.equal(f.executions.length,1);
});
test('explicitly accepted submission can still advance without an extra review',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const spec=f.executions[0];const state=await f.service.api.snapshot();const work=state.teams[0].employees.find(e=>e.id===spec.employeeId).currentWorkItem;
 await f.service.api.reviewDeliverable(work.id,{deliverableId:work.records.deliverables[0].id,decision:'accepted',feedback:'Explicit user review'});
 const result=await f.executor.tick(f.team.id,'flow');await settle(f.runtime);assert.notEqual(result.status,'blocked');assert.equal(f.executions.length,2);
});
test('switching selected workflow does not redirect background progression or cancellation',async t=>{
 const f=await setup(t);await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 const other=await f.service.api.createWorkflow(f.team.id,{name:'Other view',temporary:true});
 await f.service.api.selectWorkflow(f.team.id,other.id);
 await f.executor.tick(f.team.id,'flow');await settle(f.runtime);
 assert.equal((await f.executor.tick(f.team.id,'flow')).status,'completed');
 const state=await f.service.api.snapshot();assert.equal(state.teams[0].activeWorkflowId,other.id);
 assert.ok(state.teams[0].workflows.find(w=>w.id==='flow').nodes.every(n=>n.status==='completed'));
});
test('cancel targets the owning graph while another graph is selected',async t=>{
 const f=await setup(t);const before=await f.service.api.snapshot();const work=before.teams[0].employees.find(e=>e.currentWorkItem?.workflowId==='flow').currentWorkItem;
 const other=await f.service.api.createWorkflow(f.team.id,{name:'Other view',temporary:true});await f.service.api.selectWorkflow(f.team.id,other.id);
 await f.service.api.cancelWork(work.id);
 const team=(await f.service.api.snapshot()).teams[0];assert.equal(team.activeWorkflowId,other.id);assert.equal(team.workflows.find(w=>w.id==='flow').nodes[0].status,'blocked');assert.ok(team.cancelledWorks.find(w=>w.id===work.id)?.cancelledAt);
});
test('return targets the owning graph while another graph is selected',async t=>{
 const f=await setup(t);const other=await f.service.api.createWorkflow(f.team.id,{name:'Other view',temporary:true});await f.service.api.selectWorkflow(f.team.id,other.id);
 await f.service.api.returnCurrent(f.members[0].id);
 const team=(await f.service.api.snapshot()).teams[0];assert.equal(team.activeWorkflowId,other.id);assert.equal(team.workflows.find(w=>w.id==='flow').nodes[0].status,'ready');assert.ok(team.pendingWorks.some(w=>w.workflowNodeId==='n0'&&w.workflowId==='flow'));
});

function supervise(f) {
 const supervisor=new WorkflowSupervisor({wework:f.service,runtime:f.runtime,path:join(f.root,'workflows.json'),intervalMs:5});
 f.service.workflowSupervisor=supervisor;return supervisor;
}
test('Host start is idempotent and owns admissions; frontend cannot launch a duplicate',async t=>{
 const f=await setup(t,'submit',false);const supervisor=supervise(f);t.after(()=>supervisor.close());
 await Promise.all([f.service.call('startWorkflow',[f.team.id]),f.service.call('startWorkflow',[f.team.id])]);
 const work=(await f.service.api.snapshot()).teams[0].employees.find(e=>e.id===f.members[0].id).currentWorkItem;
 await assert.rejects(f.service.startRun({id:'renderer-run',employeeId:f.members[0].id,workId:work.id},f.runtime),/团队统一推进/);
 await supervisor.tick();await settle(f.runtime);await supervisor.tick();await settle(f.runtime);await supervisor.tick();
 assert.equal((await supervisor.control(f.team.id,'flow')).status,'completed');assert.equal(f.executions.length,2);
});
test('Host recovery does not enroll historical workflows without an explicit start',async t=>{
 const f=await setup(t);const supervisor=supervise(f);t.after(()=>supervisor.close());
 await supervisor.tick();assert.equal(f.executions.length,0);
});
test('pause persists across restart and repeated Start cannot bypass it',async t=>{
 const f=await setup(t);let supervisor=supervise(f);
 await f.service.call('startWorkflow',[f.team.id]);await supervisor.tick();await settle(f.runtime);
 await f.service.call('pauseWorkflowExecution',[f.team.id,'flow']);await supervisor.close();
 supervisor=supervise(f);t.after(()=>supervisor.close());
 await f.service.call('startWorkflow',[f.team.id]);await supervisor.tick();assert.equal(f.executions.length,1);
 await f.service.call('resumeWorkflowExecution',[f.team.id,'flow']);await supervisor.tick();await settle(f.runtime);await supervisor.tick();
 assert.equal(f.executions.length,2);assert.equal((await supervisor.control(f.team.id,'flow')).status,'completed');
});
test('background Host completes without a renderer driving ticks',async t=>{
 const f=await setup(t,'submit',false);const supervisor=supervise(f);t.after(()=>supervisor.close());
 await f.service.call('startWorkflow',[f.team.id]);await supervisor.recover();
 const deadline=Date.now()+3000;
 while((await supervisor.control(f.team.id,'flow')).status!=='completed' && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal((await supervisor.control(f.team.id,'flow')).status,'completed');assert.equal(f.executions.length,2);
});
test('Host registry resumes persisted success without replay and preserves failed blockers',async t=>{
 const f=await setup(t,'fail');let supervisor=supervise(f);
 await f.service.call('startWorkflow',[f.team.id]);await supervisor.tick();await settle(f.runtime);await supervisor.close();
 supervisor=supervise(f);t.after(()=>supervisor.close());await supervisor.tick();
 const state=await f.service.call('getWorkflowExecution',[f.team.id,'flow']);assert.equal(state.status,'blocked');assert.equal(state.blockers[0].reason,'failed');assert.equal(f.executions.length,1);
});
test('closed supervisor does not admit queued work',async t=>{
 const f=await setup(t);const supervisor=supervise(f);await supervisor.start(f.team.id);await supervisor.close();await supervisor.tick();assert.equal(f.executions.length,0);
 await assert.rejects(supervisor.start(f.team.id),/closed/);
});

test('enrolling an old renderer execution cannot silently replay its work',async t=>{
 const f=await setup(t);const work=(await f.service.api.snapshot()).teams[0].employees.find(e=>e.id===f.members[0].id).currentWorkItem;
 await f.service.startRun({id:'old-renderer',employeeId:f.members[0].id,workId:work.id},f.runtime);await settle(f.runtime);
 const supervisor=supervise(f);t.after(()=>supervisor.close());
 await assert.rejects(supervisor.start(f.team.id),/migration review/);await supervisor.tick();assert.equal(f.executions.length,1);
});
test('Host snapshot exposes failure and pause without rewriting authoritative work or persisting the projection',async t=>{
 const f=await setup(t,'fail');const supervisor=supervise(f);t.after(()=>supervisor.close());
 await supervisor.start(f.team.id);await supervisor.tick();await settle(f.runtime);await supervisor.tick();
 const projected=(await f.service.call('snapshot')).teams[0];
 assert.equal(projected.workflowExecutions[0].status,'blocked');assert.equal(projected.workflowExecutions[0].blockers[0].code,'failed');
 const current=projected.employees.find(e=>e.id===f.members[0].id).currentWorkItem;assert.equal(current.status,'running');
 assert.equal(projected.workflowExecutions[0].blockers[0].workId,current.id);
 await supervisor.control(f.team.id,'flow',false);
 assert.equal((await f.service.call('snapshot')).teams[0].workflowExecutions[0].enabled,false);
 assert.equal((await f.service.api.snapshot()).teams[0].workflowExecutions,undefined);
 projected.workflowExecutions[0].blockers.length=0;assert.equal(supervisor.snapshot(f.team.id)[0].blockers.length,1);
});
test('a supervisor storage error is visible and cannot appear as healthy execution',async t=>{
 const f=await setup(t);const supervisor=supervise(f);t.after(()=>supervisor.close());await supervisor.start(f.team.id);
 supervisor.lastError='disk unavailable';supervisor.closed=true;
 const view=(await f.service.call('snapshot')).teams[0].workflowExecutions[0];
 assert.equal(view.enabled,false);assert.equal(view.status,'blocked');assert.equal(view.blockers.at(-1).code,'storage_error');
 await supervisor.tick();assert.equal(f.executions.length,0);
});

test('submitted output is visible before completion without releasing downstream', async t => {
 const f=await setup(t); await f.executor.tick(f.team.id,'flow'); await settle(f.runtime);
 const team=(await f.service.api.snapshot()).teams[0];
 assert.equal(team.workflow.nodes[0].status,'running');
 assert.equal(team.workflow.nodes[0].outputDocumentIds.length,1);
 assert.equal(team.workflow.nodes[1].status,'waiting');
});
test('transient ownership collision keeps supervisor enabled and retries', async t => {
 const f=await setup(t); const supervisor=new WorkflowSupervisor({wework:f.service,runtime:f.runtime,path:join(f.root,'supervisor.json')});
 supervisor.entries=[{teamId:f.team.id,workflowId:'flow',enabled:true,status:'running',blockers:[],runs:[]}];
 let calls=0; supervisor.executor.tick=async()=>{ if(++calls===1) throw Object.assign(new Error('busy'),{code:'EMPLOYEE_BUSY'});return {status:'running',blockers:[]}; };
 await supervisor.tick(); assert.equal(supervisor.entries[0].enabled,true);
 await supervisor.tick(); assert.equal(calls,2);assert.deepEqual(supervisor.entries[0].blockers,[]);
});

test('explicit follow-up continues a stopped attempt after restart and preserves old evidence',async t=>{
 const f=await setup(t);let supervisor=supervise(f);
 await supervisor.start(f.team.id);await supervisor.tick();await settle(f.runtime);
 const first=f.executions[0];const old=await f.store.getRun(first.id);
 await f.store.putRun({...old,status:'cancelled'});await supervisor.tick();
 const result=await supervisor.continueWork(f.team.id,'flow',first.employeeId,first.workId,'Check existing output and finish; do not redraw.');
 await supervisor.close();supervisor=supervise(f);t.after(()=>supervisor.close());
 await supervisor.tick();await settle(f.runtime);
 assert.equal(f.executions.length,2);assert.equal(f.executions[1].id,result.runId);
 assert.equal(f.executions[1].workId,first.workId);
 assert.equal((await f.store.getRun(first.id)).status,'cancelled');
 await supervisor.tick();await settle(f.runtime);await supervisor.tick();
 assert.equal((await supervisor.control(f.team.id,'flow')).status,'completed');assert.equal(f.executions.length,3);
});
test('pending follow-ups share one attempt and reject unrelated work',async t=>{
 const f=await setup(t);const supervisor=supervise(f);t.after(()=>supervisor.close());await supervisor.start(f.team.id);
 const employee=(await f.service.api.snapshot()).teams[0].employees.find(e=>e.currentWorkItem);const work=employee.currentWorkItem;
 const a=await supervisor.continueWork(f.team.id,'flow',employee.id,work.id,'First instruction');
 const b=await supervisor.continueWork(f.team.id,'flow',employee.id,work.id,'Second instruction');assert.equal(a.runId,b.runId);
 await assert.rejects(supervisor.continueWork(f.team.id,'flow',employee.id,'other','Wrong task'),/已结束或分配已变化/);
 await supervisor.tick();await settle(f.runtime);assert.equal(f.executions.length,1);
});

test('workbench message reaches the owned task and does not create an unmanaged run',async t=>{
 const f=await setup(t,'empty');const supervisor=supervise(f);t.after(()=>supervisor.close());
 const {CollaborationCoordinator}=await import('../src/host/collaboration-coordinator.js');
 const coordinator=new CollaborationCoordinator({wework:f.service,runtime:f.runtime});f.service.attachCoordinator(coordinator);t.after(()=>coordinator.close());
 await supervisor.start(f.team.id);await supervisor.tick();await settle(f.runtime);await supervisor.tick();
 const first=f.executions[0];
 const reply=await f.service.call('sendWorkbenchTab',[first.employeeId,first.workId,'Use existing output; report what is complete.']);
 assert.equal(reply.queued,true);await supervisor.tick();await settle(f.runtime);
 assert.equal(f.executions.length,2);assert.equal(f.executions[1].id,reply.runId);
 assert.equal(f.executions[1].session.id,first.session.id);
 assert.ok(JSON.stringify(f.executions[1]).includes('Use existing output; report what is complete.'));
});
