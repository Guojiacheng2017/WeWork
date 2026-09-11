import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRemoteSmalldashRun } from '../src/smalldash-remote-runtime.js';

test('runs an employee session through remote SDH HTTP and SSE', async () => {
  const calls=[]; const encoder=new TextEncoder();
  const body=new ReadableStream({start(controller){controller.enqueue(encoder.encode('event: connected\ndata: {"type":"connected"}\n\nevent: text\ndata: {"type":"text","content":"done"}\n\nevent: done\ndata: {"type":"done"}\n\n'));}});
  const sdh={connection:{get:async()=>({baseUrl:'http://gpu:23334'})},fetch:async()=>new Response(body),request:async(path,init={})=>{calls.push([path,init.method]);if(path.endsWith('/history'))return {messages:[{role:'assistant',content:'done'}]};return {sessionId:'session-1',accepted:true};}};
  const result=await executeRemoteSmalldashRun({employeeId:'e1',runtimeProfile:{systemPrompt:'',adapter:'smalldash'},employee:{displayName:'A',roleName:'R',skills:[]},workspace:{kind:'local',rootPath:process.cwd()},session:{id:'session-1'},work:{title:'T',goal:'G'}},{sdh,bundledSkillRoots:[]});
  assert.equal(result.finalText,'done');
  assert.ok(calls.some(([path])=>path==='/api/chat/init'));
  assert.ok(calls.some(([path])=>path.startsWith('/api/chat/wework-')&&!path.endsWith('/history')));
});

test('bridges remote SDH tool calls back to the local WeWork tool executor', async () => {
  const calls=[]; const executed=[]; const encoder=new TextEncoder();
  const body=new ReadableStream({start(controller){controller.enqueue(encoder.encode([
    'event: tool_call\ndata: {"callId":"call-1","name":"wework_get_dag","arguments":{}}',
    'event: tool_result\ndata: {"callId":"call-1","name":"wework_get_dag","ok":true}',
    'event: text\ndata: {"content":"saved"}',
    'event: done\ndata: {}',
    '',
  ].join('\n\n')));}});
  const sdh={connection:{get:async()=>({baseUrl:'http://gpu:23334'})},fetch:async()=>new Response(body),request:async(path,init={})=>{
    calls.push({path,body:init.body&&JSON.parse(init.body)});
    if(path.endsWith('/history'))return {messages:[{role:'assistant',content:'saved'}]};
    return {accepted:true};
  }};
  const tools=[{name:'wework_get_dag',description:'Read DAG',parameters:{type:'object',properties:{}},mutating:true,execute:async(callId,args)=>{executed.push({callId,args});return {details:{version:2,nodes:[]}};}}];
  const result=await executeRemoteSmalldashRun({employeeId:'e1',runtimeProfile:{systemPrompt:'',adapter:'smalldash'},employee:{displayName:'A',roleName:'R',skills:[]},workspace:{kind:'local',rootPath:process.cwd()},session:{id:'session-1'},work:{title:'T',goal:'G'}},{sdh,bundledSkillRoots:[],tools});
  assert.deepEqual(executed,[{callId:'call-1',args:{}}]);
  assert.deepEqual(calls.find(call=>call.path==='/api/chat/init').body.tools.map(({name,mutating})=>({name,mutating})),[{name:'wework_get_dag',mutating:true}]);
  assert.deepEqual(calls.find(call=>call.path.includes('/tool-result')).body,{callId:'call-1',name:'wework_get_dag',result:{version:2,nodes:[]}});
  assert.equal(result.toolCalls[0].status,'succeeded');
  assert.equal(result.mutated,true);
});

test('rejects a textual success when a requested DAG mutation never called the write tool', async () => {
  const encoder=new TextEncoder();
  const body=new ReadableStream({start(controller){controller.enqueue(encoder.encode('event: text\ndata: {"content":"DAG 已完成"}\n\nevent: done\ndata: {}\n\n'));}});
  const sdh={connection:{get:async()=>({baseUrl:'http://gpu:23334'})},fetch:async()=>new Response(body),request:async(path)=>path.endsWith('/history')?{messages:[]}:{accepted:true}};
  const tools=[{name:'wework_save_dag',description:'Save DAG',parameters:{type:'object',properties:{}},execute:async()=>({})}];
  await assert.rejects(executeRemoteSmalldashRun({employeeId:'e1',runtimeProfile:{systemPrompt:'',adapter:'smalldash'},employee:{displayName:'A',roleName:'R',skills:[]},workspace:{kind:'local',rootPath:process.cwd()},session:{id:'session-1'},work:{title:'排布 DAG',goal:'重新排布 DAG 并保存'}},{sdh,bundledSkillRoots:[],tools}),/没有成功调用 wework_save_dag/);
});
