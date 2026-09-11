import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { WeWorkService, FileWeWorkStorage } from '../../app-runtime/src/host/wework-service.js';
import { createWeWorkTools } from '../../app-runtime/src/wework-tools.js';
import { executePiRun } from '../../app-runtime/src/pi-runtime.js';
import { RuntimeManager } from '../../app-runtime/src/host/runtime-manager.js';
import { CheckpointStore } from '../../app-runtime/src/host/checkpoint-store.js';
const here = dirname(fileURLToPath(import.meta.url));
const bytes = await readFile(join(here, 'samples/research-001.json'));
const sample = JSON.parse(bytes), provenance = JSON.parse(await readFile(join(here, 'samples/provenance.json')));
assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256);
const root = resolve(process.argv[2] ?? join(here, 'runs', new Date().toISOString().replace(/[:.]/g, '-')));
await mkdir(root, { recursive: true });
const workspace = join(root, 'workspace'); await mkdir(workspace);
const statePath = join(root, 'wework.json');
const service = new WeWorkService(new FileWeWorkStorage(statePath), { currentWorkspace: async () => ({ kind: 'local', rootPath: workspace }) });
const team = await service.api.createTeam({ name: 'MARBLE research smoke', runtime: 'Workspace' });
const profile = await service.api.createRuntimeProfile({ name: 'Local Pi smoke', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, thinkingLevel: 'off', enabled: true, systemPrompt: 'This is a source-bounded benchmark integration run. Treat source profiles as fictional task expertise, not verified personal credentials. Do not use external tools or claim experiments or literature searches were performed. Read task context and full input documents (follow nextOffset until null). Each profile belongs to a specific source agent. Verify upstream source claims against the originating agent profile in the shared registry, never your own profile by default. Save your contribution with wework_save_output, then submit it with wework_submit_deliverable. Do not approve the submission. Use at most 800 words per contribution.' });
const stages = ['Review supplied introduction and identify limitations.','Propose two candidate methods building on the first contribution.','Challenge the candidates and identify unsupported claims, feasibility issues and missing evidence.','Refine the proposal, reconcile criticisms and outline experiments with measurable criteria.','Synthesize all contributions into the requested five questions, using headings [Question 1] through [Question 5]. Distinguish proposed results from measured results and novelty hypotheses from verified literature findings.'];
const nodes = [], outputs = [], completed = new Set(), calls = [];
let eventWrites = Promise.resolve();
const store = new CheckpointStore(join(root, 'runtime'));
const manager = new RuntimeManager({ store, journal: { publish(event) { eventWrites = eventWrites.then(() => appendFile(join(root, 'events.jsonl'), JSON.stringify(event)+'\n')); } },
 execute: (spec, options) => {
  const allowed = new Set(['wework_get_team','wework_get_task_context','wework_read_task_field','wework_read_document','wework_report_progress','wework_save_output','wework_submit_deliverable']);
  const tools = createWeWorkTools(service, spec, options.signal).filter(t => allowed.has(t.name)).map(t => ({ ...t, execute: async (...args) => { const start = Date.now(); try { const value = await t.execute(...args); calls.push({runId:spec.id, name:t.name, ok:true, ms:Date.now()-start}); return value; } catch(e) { calls.push({runId:spec.id,name:t.name,ok:false,error:e.message}); throw e; } } }));
  return executePiRun(spec, { ...options, tools, extensionPath: resolve(here,'../../app-runtime/src/pi-wework-extension.mjs'), env: { PI_CODING_AGENT_SESSION_DIR: join(root,'native-sessions') },
   spawnProcess: spawnRestrictedPi });
 }, onFinish: (...args) => service.finish(...args) });
// Restrict native Pi capabilities and ambient discovery for this already-authorized test.
import { spawn } from 'node:child_process';
function spawnRestrictedPi(file,args,options) { return spawn(file,[...args,'--no-builtin-tools','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files'],options); }
const report = { mode:provenance.mode, provenance, root, stages:[], checks:{}, limitations:provenance.adaptations, permission:'fixed preauthorized smoke scope; no adaptive history; submissions remain unaccepted' };
try {
 for (let i=0; i<sample.agents.length; i++) {
  const employee = await service.api.addEmployee(team.id,{displayName:`Research employee ${i+1}`,roleName:sample.agents[i].agent_id,runtime:'Pi',defaultRuntimeProfileId:profile.id});
  const work = await service.api.createWork(team.id,{title:`Research stage ${i+1}`,goal:stages[i],priority:'medium',category:'Digital'});
  await service.api.assignWork(work.id,employee.id);
  await service.api.saveWorkDocument(work.id,{title:'Original benchmark task',kind:'input',content:sample.task.content});
  await service.api.saveWorkDocument(work.id,{title:`Current role profile: ${sample.agents[i].agent_id} (source data)`,kind:'input',content:sample.agents[i].profile});
  await service.api.saveWorkDocument(work.id,{title:'Shared source registry: original benchmark profiles by agent',kind:'input',content:sample.agents.map(a=>`## ${a.agent_id}\n${a.profile}`).join('\n\n')});
  for (const output of outputs) await service.api.saveWorkDocument(work.id,{title:`Upstream ${output.stage} by agent${output.stage}: ${output.title}`,kind:'input',content:output.content});
  const node = {id:`stage-${i+1}`,employeeId:employee.id,workId:work.id,dependsOn:i?[`stage-${i}`]:[]};
  assert.ok(node.dependsOn.every(id=>completed.has(id)), 'Upstream stage not complete'); nodes.push(node);
  await writeFile(join(root,'dag.json'),JSON.stringify({kind:'smoke-only explicit dependency scheduler',nodes},null,2));
  const spec = await service.prepare({id:randomUUID(),employeeId:employee.id,workId:work.id});
  const start=Date.now(); await manager.start(spec);
  const timer=setTimeout(()=>manager.cancel(spec.id).catch(()=>{}),180000);
  await manager.active.get(spec.id)?.done; clearTimeout(timer);
  const run=await manager.get(spec.id); assert.equal(run.status,'succeeded',run.error);
  const fresh=new WeWorkService(new FileWeWorkStorage(statePath));
  const current=(await fresh.api.snapshot()).teams.find(t=>t.id===team.id).employees.find(e=>e.id===employee.id).currentWorkItem;
  assert.equal(current.deliveryStatus,'submitted');
  const submitted=current.records.deliverables.at(-1); assert.ok(submitted);
  const context=await fresh.api.getWorkContext(work.id);
  await writeFile(join(root,`context-${i+1}.json`),JSON.stringify(context,null,2));
  // Read the exact immutable document submitted by this employee.
  const doc=await fresh.api.readWorkDocument(work.id,submitted.documentIds[0],0);
  let nextOffset=doc.nextOffset;
  while(nextOffset!==null) { const page=await fresh.api.readWorkDocument(work.id,submitted.documentIds[0],nextOffset);doc.content+=page.content;nextOffset=page.nextOffset; }
  assert.ok(doc.content?.length>100, 'Empty or missing persisted contribution');
  outputs.push({stage:i+1,title:doc.title,content:doc.content});
  await writeFile(join(root,`stage-${i+1}.md`),doc.content);
  completed.add(node.id);
  report.stages.push({stage:i+1,runId:spec.id,status:run.status,deliveryStatus:current.deliveryStatus,ms:Date.now()-start,documentId:submitted.documentIds[0]});
  console.log(JSON.stringify(report.stages.at(-1)));
 }
 const final=outputs.at(-1).content;
 report.checks={allEmployeesExecuted:report.stages.length===sample.agents.length,persistedSubmissions:outputs.length===sample.agents.length,upstreamDependenciesSatisfied:completed.size===nodes.length,fiveQuestions:[1,2,3,4,5].every(n=>final.includes(`[Question ${n}]`)),notAutoAccepted:report.stages.every(s=>s.deliveryStatus==='submitted')};
 assert.ok(Object.values(report.checks).every(Boolean),'Structural checks failed'); report.ok=true;
} catch(error) { report.ok=false;report.error=error.message;process.exitCode=1; }
finally { await eventWrites;await writeFile(join(root,'tool-calls.json'),JSON.stringify(calls,null,2));await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,error:report.error,root,checks:report.checks})); }
