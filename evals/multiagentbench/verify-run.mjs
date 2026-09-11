import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root=resolve(process.argv[2]);
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const report=await read('report.json');assert.equal(report.ok,true);
const dag=await read('dag.json');const state=await read('wework.json');
const teams=state.teams ?? state.state?.teams;
assert.ok(Array.isArray(teams),'Unrecognized state serialization');
const employees=teams.flatMap(t=>t.employees);
const findings=[];let tokens=0;const models=new Set();
for(const [i,node] of dag.nodes.entries()) {
 const employee=employees.find(e=>e.id===node.employeeId);assert.ok(employee);
 const work=employee.currentWorkItem;assert.equal(work.id,node.workId);
 const submission=work.records.deliverables.at(-1);assert.ok(submission);
 const output=work.records.documents.find(d=>d.id===submission.documentIds[0]);assert.ok(output);
 assert.equal(await readFile(join(root,`stage-${i+1}.md`),'utf8'),output.content,'Export must match full immutable submission');
 assert.equal(work.deliveryStatus,'submitted');
 for(let j=0;j<i;j++) {const previous=employees.find(e=>e.id===dag.nodes[j].employeeId).currentWorkItem;const d=previous.records.documents.find(d=>d.id===previous.records.deliverables.at(-1).documentIds[0]);assert.ok(work.records.documents.some(x=>x.kind==='input'&&x.content===d.content),'Upstream output missing or changed');}
 const run=await read(`runtime/run-${report.stages[i].runId}.json`);assert.equal(run.status,'succeeded');
 const checkpoint=await read(`runtime/checkpoint-${run.sessionId}.json`);
 tokens+=checkpoint.usage?.total ?? 0;
 const toolCalls=checkpoint.messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='toolCall'):[]);
 const registry=work.records.documents.find(d=>d.title.startsWith('Shared source registry'));
 const reads=registry?toolCalls.filter(c=>c.name==='wework_read_document'&&c.arguments?.documentId===registry.id):[];
 findings.push({stage:i+1,persisted:true,upstreamCopiesVerified:i,sharedRegistryPresent:!!registry,sharedRegistryRead:reads.length>0,sharedRegistryReadToEnd:!!registry&&Array.from({length:Math.ceil(registry.content.length/8000)},(_,k)=>k*8000).every(offset=>reads.some(c=>(c.arguments.offset??0)===offset))});
}
for(const file of await readdir(join(root,'native-sessions'))) {
 for(const line of (await readFile(join(root,'native-sessions',file),'utf8')).trim().split('\n')) {const event=JSON.parse(line);if(event.type==='model_change')models.add(`${event.provider}/${event.modelId}`);}
}
const result={ok:true,totalTokens:tokens,models:[...models],findings,scope:'Persistence, original upstream content, and source availability/read checks. Not a semantic or official benchmark score.'};
await writeFile(join(root,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
