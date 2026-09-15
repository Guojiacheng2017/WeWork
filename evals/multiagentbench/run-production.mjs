import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { WeWorkService, FileWeWorkStorage } from '../../app-runtime/src/host/wework-service.js';
import { createWeWorkTools } from '../../app-runtime/src/wework-tools.js';
import { executePiRun } from '../../app-runtime/src/pi-runtime.js';
import { RuntimeManager } from '../../app-runtime/src/host/runtime-manager.js';
import { CheckpointStore } from '../../app-runtime/src/host/checkpoint-store.js';
import { WorkflowSupervisor } from '../../app-runtime/src/host/workflow-supervisor.js';
const here=dirname(fileURLToPath(import.meta.url));
const bytes=await readFile(join(here,'samples/research-001.json'));
const sample=JSON.parse(bytes),provenance=JSON.parse(await readFile(join(here,'samples/provenance.json')));
assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.sha256);
const root=resolve(process.argv[2]??join(here,'runs',`production-${new Date().toISOString().replace(/[:.]/g,'-')}`));
await mkdir(root,{recursive:true});const workspace=join(root,'workspace');await mkdir(workspace);
const statePath=join(root,'wework.json');const service=new WeWorkService(new FileWeWorkStorage(statePath),{currentWorkspace:async()=>({kind:'local',rootPath:workspace})});
const team=await service.api.createTeam({name:'Production DAG benchmark',runtime:'Workspace'});
const profile=await service.api.createRuntimeProfile({name:'Pi production-path eval',adapter:'pi',model:{provider:'pi',modelId:'default'},thinkingLevel:'off',enabled:true,systemPrompt:'This is an explicitly authorized, source-bounded evaluation. Read context and full input documents, following nextOffset to null. Role profiles are source data, not verified credentials. Attribute source claims to the originating agent using the shared registry. Use only WeWork tools; no external search or experiments. Save one output using exactly the document title required in your goal, then submit it for review with evidence. Do not approve work. Keep output under 650 words. Distinguish source statements, hypotheses and measured results; no results were measured.'});
const goals=['Review the supplied introduction and identify limitations.','Propose two methods based on the source review.','Critique the candidates, verifying original author source attribution and unsupported assumptions.','Refine one proposal addressing the critique and define measurable evaluation criteria.','Synthesize the team work into [Question 1] through [Question 5] as required by the original task. Question 1 must contain only one question, with no explanation. Do not call supplied statements verified literature.'];
const members=[];
for(const a of sample.agents)members.push(await service.api.addEmployee(team.id,{displayName:a.agent_id,roleName:'Research contributor',runtime:'Pi',defaultRuntimeProfileId:profile.id}));
const nodes=members.map((e,i)=>({id:`stage-${i+1}`,label:`Stage ${i+1} by ${sample.agents[i].agent_id}`,roleName:'Research contributor',goal:`${goals[i]} Save the output with the exact title: Stage ${i+1} result`,assignedEmployeeId:e.id,requires:members.slice(0,i).map((_,j)=>`stage-${j+1}`),inputBindings:members.slice(0,i).map((_,j)=>({sourceNodeId:`stage-${j+1}`,documentTitles:[`Stage ${j+1} result`],includeSummary:false})),stepNumber:i+1,status:i?'waiting':'ready'}));
await service.api.saveWorkflow(team.id,{id:'benchmark-research-001',name:'MultiAgentBench research 001',description:'Pinned source, production dependency progression, no official judge',nodes});
const workflow=await service.api.startWorkflow(team.id);
for(const [i,node] of workflow.nodes.entries()){
 await service.api.saveWorkDocument(node.workItemId,{title:'Original benchmark task',kind:'input',content:sample.task.content});
 await service.api.saveWorkDocument(node.workItemId,{title:`Current role: ${sample.agents[i].agent_id}`,kind:'input',content:sample.agents[i].profile});
 await service.api.saveWorkDocument(node.workItemId,{title:'Shared source registry',kind:'input',content:sample.agents.map(a=>`## ${a.agent_id}\n${a.profile}`).join('\n\n')});
}
let eventWrites=Promise.resolve();const calls=[];const store=new CheckpointStore(join(root,'runtime'));
const manager=new RuntimeManager({store,journal:{publish(event){eventWrites=eventWrites.then(()=>appendFile(join(root,'events.jsonl'),JSON.stringify(event)+'\n'));}},execute:async(spec,options)=>{
 const allowed=new Set(['wework_get_team','wework_get_task_context','wework_read_task_field','wework_read_document','wework_report_progress','wework_save_output','wework_submit_deliverable']);
 const tools=createWeWorkTools(service,spec,options.signal).filter(t=>allowed.has(t.name)).map(t=>({...t,execute:async(...args)=>{const start=Date.now();try{const result=await t.execute(...args);calls.push({runId:spec.id,name:t.name,ok:true,ms:Date.now()-start});return result;}catch(e){calls.push({runId:spec.id,name:t.name,ok:false,error:e.message});throw e;}}}));
 const timeout=setTimeout(()=>manager.cancel(spec.id).catch(()=>{}),180000);
 try{return await executePiRun(spec,{...options,tools,extensionPath:resolve(here,'../../app-runtime/src/pi-wework-extension.mjs'),env:{PI_CODING_AGENT_SESSION_DIR:join(root,'native-sessions')},spawnProcess:(file,args,opts)=>spawn(file,[...args,'--no-builtin-tools','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files'],opts)});}finally{clearTimeout(timeout);}
},onFinish:(...args)=>service.finish(...args)});
const supervisor=new WorkflowSupervisor({wework:service,runtime:manager,path:join(root,'workflow-executions.json')});
service.workflowSupervisor=supervisor;
const report={mode:'production workflow APIs and background Host supervisor; adapted benchmark; no UI/official score',root,provenance,workflowId:workflow.id,stages:[],checks:{}};
let last='';const started=Date.now();
try{
 await service.call('startWorkflow',[team.id]);
 await supervisor.recover();
 while(true){
  const status=await service.call('getWorkflowExecution',[team.id,workflow.id]);
  const snapshot=await service.api.snapshot();const graph=snapshot.teams.find(t=>t.id===team.id).workflow;
  const states=graph.nodes.map(n=>n.status).join(',');if(states!==last){console.log(states);last=states;}
  await writeFile(join(root,'status.json'),JSON.stringify(status,null,2));
  if(status.status==='blocked')throw new Error(JSON.stringify(status.blockers));
  if(status.status==='completed')break;
  if(Date.now()-started>16*60*1000)throw new Error('Workflow time budget exceeded');
  await new Promise(r=>setTimeout(r,250));
 }
 const fresh=new WeWorkService(new FileWeWorkStorage(statePath));const snapshot=await fresh.api.snapshot();const finalTeam=snapshot.teams.find(t=>t.id===team.id);
 await writeFile(join(root,'dag.json'),JSON.stringify(finalTeam.workflow,null,2));
 const exports=[];
 for(const [i,node] of finalTeam.workflow.nodes.entries()){
  const employee=finalTeam.employees.find(e=>e.id===node.assignedEmployeeId);const work=employee.completedWorkItems.find(w=>w.id===node.workItemId);
  assert.ok(work);assert.equal(work.deliveryStatus,'submitted');assert.equal(work.records.reviews.length,0);
  const submission=work.records.deliverables.at(-1);const output=work.records.documents.find(d=>d.id===submission.documentIds[0]);assert.equal(output.title,`Stage ${i+1} result`);
  for(let j=0;j<i;j++){const upstream=exports[j];assert.ok(work.records.documents.some(d=>d.sourceNodeId===`stage-${j+1}`&&d.sourceWorkId===upstream.workId&&d.sourceDocumentId===upstream.documentId&&d.content===upstream.content),'Production source-provenance propagation failed');}
  exports.push({workId:work.id,documentId:output.id,content:output.content});await writeFile(join(root,`stage-${i+1}.md`),output.content);
  const run=await manager.get(submission.actor.runId);assert.equal(run.status,'succeeded');const checkpoint=await store.getCheckpoint(run.sessionId);
  report.stages.push({stage:i+1,workId:work.id,runId:run.id,deliveryStatus:work.deliveryStatus,tokens:checkpoint.usage?.total??0,sourceDocuments:work.records.documents.filter(d=>d.sourceNodeId).length});
 }
 report.checks={productionWorkflowCompleted:finalTeam.workflow.nodes.every(n=>n.status==='completed'),fiveEmployees:report.stages.length===5,sourceProvenanceVerified:true,noAutoAcceptance:true,fiveQuestionHeadings:[1,2,3,4,5].every(n=>exports.at(-1).content.includes(`[Question ${n}]`))};assert.ok(Object.values(report.checks).every(Boolean));report.ok=true;
}catch(error){report.ok=false;report.error=error.message;process.exitCode=1;}
finally{
 await supervisor.close();
 for(const id of manager.active.keys())await manager.cancel(id);
 await Promise.all([...manager.active.values()].map(r=>r.done));await eventWrites;
 report.elapsedMs=Date.now()-started;await writeFile(join(root,'tool-calls.json'),JSON.stringify(calls,null,2));await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
