import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeSmalldashRun, invokeSmalldashControl } from '../src/smalldash-runtime.js';

test('WeWork manages the bundled SDH model catalog through its stable IPC', async () => {
  const root=await mkdtemp(join(tmpdir(),'wework-sdh-models-'));
  const options={dataRoot:root,runnerPath:process.env.WEWORK_TEST_SDH_RUNNER_PATH};
  const saved=await invokeSmalldashControl({type:'models.save',config:{name:'Local model',provider:'openai-compatible',modelId:'local-1',baseUrl:'http://127.0.0.1:9/v1',authentication:'none'}},options);
  assert.equal(saved.model.configured,true);
  assert.equal(saved.model.authentication,'none');
  const selected=await invokeSmalldashControl({type:'models.setDefault',id:saved.model.id},options);
  assert.equal(selected.defaultId,saved.model.id);
  const listed=await invokeSmalldashControl({type:'models.list'},options);
  assert.equal(listed.models[0].id,saved.model.id);
  assert.equal(listed.defaultId,saved.model.id);
});

test('bundled sdh uses selected model, executes Host tools and resumes native history', async t => {
  const requests=[];
  const server=createServer(async(req,res)=>{
    let body=''; for await(const chunk of req) body+=chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200,{'content-type':'text/event-stream'});
    const delta=requests.length===1 ? {tool_calls:[{index:0,id:'call-1',type:'function',function:{name:'wework_get_team',arguments:'{}'}}]} : {content:'team acknowledged'};
    res.end(`data: ${JSON.stringify({choices:[{delta}]})}\n\ndata: [DONE]\n\n`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const root=await mkdtemp(join(tmpdir(),'wework-sdh-'));
  const spec={id:'first',employeeId:'employee',runtimeProfile:{id:'sdh',adapter:'smalldash',model:{provider:'openai',modelId:'test-selected-model',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,contextWindow:4096,maxTokens:512}},employee:{displayName:'Tester',roleName:'team lead',skills:[]},workspace:{kind:'local',rootPath:root},session:{id:'team-a-employee-session'},work:{title:'test',goal:'read team'}};
  let executed=0;
  const options={dataRoot:root,runnerPath:process.env.WEWORK_TEST_SDH_RUNNER_PATH,tools:[{name:'wework_get_team',description:'Read team',parameters:{type:'object',properties:{}},execute:async()=>{executed++;return {content:[{type:'text',text:'{"name":"TEAM-A"}'}]};}}]};
  const first=await executeSmalldashRun(spec,options);
  assert.equal(first.finalText,'team acknowledged');
  assert.equal(executed,1);
  assert.equal(requests[0].model,'test-selected-model');
  assert.equal(requests[1].messages.at(-1).role,'tool');
  assert.match(requests[1].messages.at(-1).content,/TEAM-A/);
  const second=await executeSmalldashRun({...spec,id:'second',session:{...spec.session,nativeSessionId:first.nativeSessionId},followUp:'continue'},options);
  assert.equal(second.nativeSessionId,first.nativeSessionId);
  assert.ok(requests.at(-1).messages.some(m=>m.role==='assistant' && m.content==='team acknowledged'));
  const differentProfile=await executeSmalldashRun({...spec,id:'third',runtimeProfile:{...spec.runtimeProfile,id:'other-profile'},session:{id:'team-a-employee-session'}},options);
  assert.notEqual(differentProfile.nativeSessionId,first.nativeSessionId);
  assert.equal(requests.at(-1).messages.filter(m=>m.role==='user').length,1);
});

test('bundled sdh continues a native Session from the prior packaged Desktop data root without overwriting a newer target', async t => {
  const requests=[];
  const server=createServer(async(req,res)=>{ let body=''; for await(const chunk of req) body+=chunk; requests.push(JSON.parse(body)); res.writeHead(200,{'content-type':'text/event-stream'}); res.end('data: {"choices":[{"delta":{"content":"continued"}}]}\n\ndata: [DONE]\n\n'); });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>{server.closeAllConnections();server.close();});
  const root=await mkdtemp(join(tmpdir(),'wework-sdh-migrate-'));
  const weworkRoot=join(root,'Documents','WeWork'); const runtimeDataRoot=join(root,'Documents','.wework','runtime-data');
  const nativeSessionId='wework-legacy-session';
  const legacyPath=join(weworkRoot,'smalldash','sessions',`${nativeSessionId}.json`);
  await mkdir(join(legacyPath,'..'),{recursive:true});
  await writeFile(legacyPath,JSON.stringify({id:nativeSessionId,messages:[{role:'system',content:'old persona'},{role:'user',content:'legacy question'},{role:'assistant',content:'legacy answer'}],chatEvents:[],trackedTaskIds:[],createdAt:'old',updatedAt:1,label:''}));
  const workspace=join(root,'workspace'); await mkdir(workspace,{recursive:true});
  const spec={id:'migration-run',employeeId:'employee',runtimeProfile:{id:'sdh',adapter:'smalldash',model:{provider:'openai',modelId:'fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`}},employee:{displayName:'Worker',roleName:'Analyst',skills:[]},workspace:{kind:'local',rootPath:workspace},session:{id:'wework-session',nativeSessionId},work:{title:'Continue',goal:'Continue'}};
  const options={dataRoot:runtimeDataRoot,legacyDataRoots:[weworkRoot],runnerPath:process.env.WEWORK_TEST_SDH_RUNNER_PATH};

  await executeSmalldashRun(spec,options);
  assert.ok(requests[0].messages.some(message=>message.content==='legacy answer'));
  const targetPath=join(runtimeDataRoot,'smalldash','sessions',`${nativeSessionId}.json`);
  await writeFile(targetPath,JSON.stringify({id:nativeSessionId,messages:[{role:'assistant',content:'newer target'}],chatEvents:[],trackedTaskIds:[],createdAt:'new',updatedAt:2,label:''}));
  await executeSmalldashRun({...spec,id:'second-migration-run'},options);
  assert.match(await readFile(targetPath,'utf8'),/newer target/);
});
