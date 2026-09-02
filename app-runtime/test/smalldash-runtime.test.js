import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { executeSmalldashRun } from '../src/smalldash-runtime.js';

async function fixture(t,respond) {
  const server=createServer(respond);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const root=await mkdtemp(join(tmpdir(),'sdh-stream-'));
  return {spec:{id:'run-1',employeeId:'employee',employee:{displayName:'QA',roleName:'Verifier'},work:{title:'Smoke',goal:'Verify'},runtimeProfile:{id:'profile',adapter:'smalldash',model:{modelId:'fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,contextWindow:4096,maxTokens:512}},session:{id:'session-1'},workspace:{kind:'local',rootPath:root}},options:{dataRoot:root}};
}

test('truncated model stream cannot be reported as success',async t=>{
  const {spec,options}=await fixture(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  });
  await assert.rejects(executeSmalldashRun(spec,options),/stream.*complet|complete.*stream/i);
});

test('cancellation waits for the real sdh child to close',async t=>{
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const {spec,options}=await fixture(t,(_req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': waiting\n\n');entered();});
  const controller=new AbortController();
  const run=executeSmalldashRun(spec,{...options,signal:controller.signal});
  const rejected=assert.rejects(run,/cancelled/);
  await started;controller.abort(new Error('cancelled'));
  await rejected;
});

test('cancellation also waits for an already admitted Host tool write',async t=>{
  const {spec,options}=await fixture(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.end('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"write-1","function":{"name":"wework_write","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n');
  });
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const controller=new AbortController();
  let settled=false;
  const run=executeSmalldashRun(spec,{...options,signal:controller.signal,tools:[{name:'wework_write',description:'write',parameters:{type:'object'},execute:async()=>{entered();await new Promise(resolve=>{release=resolve;});return {content:[]};}}]}).finally(()=>{settled=true;});
  const rejected=assert.rejects(run,/cancelled/);
  await started;controller.abort(new Error('cancelled'));
  try { await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false); }
  finally {release();}
  await rejected;
});

test('the embedded child never inherits the Host bearer token', async t => {
  const root=await mkdtemp(join(tmpdir(),'sdh-child-env-'));
  const runner=join(root,'runner.mjs');
  await writeFile(runner,`process.on('message',(message)=>{ if(message.type==='start'){ process.send({type:'result',result:{nativeSessionId:message.nativeSessionId,messages:[],finalText:process.env.WEWORK_HOST_TOKEN ?? 'absent',usage:{}}}); process.disconnect(); } });`);
  const workspace=join(root,'workspace'); await import('node:fs/promises').then(({mkdir})=>mkdir(workspace));
  const prior=process.env.WEWORK_HOST_TOKEN; process.env.WEWORK_HOST_TOKEN='host-secret';
  t.after(()=>{ if(prior===undefined) delete process.env.WEWORK_HOST_TOKEN; else process.env.WEWORK_HOST_TOKEN=prior; });
  const result=await executeSmalldashRun({id:'env-run',employeeId:'employee',runtimeProfile:{id:'profile',adapter:'smalldash',model:{modelId:'fixture',baseUrl:'http://127.0.0.1:1/v1'}},employee:{displayName:'Worker',roleName:'Analyst',skills:[]},work:{title:'Env',goal:'Check'},workspace:{kind:'local',rootPath:workspace},session:{id:'session'}},{dataRoot:root,runnerPath:runner});
  assert.equal(result.finalText,'absent');
});

test('assigned canonical employee Skills are loaded into smalldash execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sdh-canonical-skill-'));
  const workspace = join(root, 'workspace');
  const employeeSkills = join(root, 'WeWork', 'team', 'employees', 'employee', 'skills');
  await mkdir(workspace, { recursive: true });
  await mkdir(join(employeeSkills, 'specialist'), { recursive: true });
  await writeFile(join(employeeSkills, 'specialist', 'SKILL.md'), '# Specialist\nCANONICAL_EMPLOYEE_SKILL');
  const runner = join(root, 'runner.mjs');
  await writeFile(runner, `process.on('message',(message)=>{ if(message.type==='start'){ process.send({type:'result',result:{nativeSessionId:message.nativeSessionId,messages:[],finalText:message.persona,usage:{}}}); process.disconnect(); } });`);
  const spec = { id: 'skill-run', employeeId: 'employee', runtimeProfile: { id: 'profile', adapter: 'smalldash', model: { modelId: 'fixture', baseUrl: 'http://127.0.0.1:1/v1' } }, employee: { displayName: 'Worker', roleName: 'Analyst', skills: [{ id: 'specialist', name: 'Specialist' }] }, work: { title: 'Skill', goal: 'Use it' }, workspace: { kind: 'local', rootPath: workspace }, skillRoots: [employeeSkills], session: { id: 'session' } };

  const result = await executeSmalldashRun(spec, { dataRoot: root, runnerPath: runner });
  assert.match(result.finalText, /CANONICAL_EMPLOYEE_SKILL/);
});

test('a disabled network permission permits loopback models but rejects remote model endpoints', async t => {
  const root=await mkdtemp(join(tmpdir(),'sdh-network-policy-')); const workspace=join(root,'workspace'); await import('node:fs/promises').then(({mkdir})=>mkdir(workspace));
  const runner=join(root,'runner.mjs'); await writeFile(runner,`process.on('message',(message)=>{ if(message.type==='start'){ process.send({type:'result',result:{nativeSessionId:message.nativeSessionId,messages:[],finalText:'ok',usage:{}}}); process.disconnect(); } });`);
  const base={id:'network-run',employeeId:'employee',runtimeProfile:{id:'profile',adapter:'smalldash',model:{modelId:'fixture',baseUrl:'https://models.example/v1'}},runtimeSettings:{permissions:{network:false}},employee:{displayName:'Worker',roleName:'Analyst',skills:[]},work:{title:'Network',goal:'Check'},workspace:{kind:'local',rootPath:workspace},session:{id:'session'}};
  await assert.rejects(executeSmalldashRun(base,{dataRoot:root,runnerPath:runner}),/network permission/i);
  const result=await executeSmalldashRun({...base,id:'loopback-run',runtimeProfile:{...base.runtimeProfile,model:{...base.runtimeProfile.model,baseUrl:'http://127.0.0.1:8000/v1'}}},{dataRoot:root,runnerPath:runner});
  assert.equal(result.finalText,'ok');
});
