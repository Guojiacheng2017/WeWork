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
