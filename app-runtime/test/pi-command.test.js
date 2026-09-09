import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {executePiCommand} from '../src/pi-command.js';
const spec={runtimeProfile:{adapter:'pi',model:{provider:'pi',modelId:'default'}},workspace:{kind:'local',rootPath:process.cwd()},session:{id:'employee-current-chat'}};
function mock(success=true) {
 return (_file,args,options)=>{
  assert.equal(args[args.indexOf('--session-id')+1],spec.session.id);assert.equal(options.shell,false);
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kill=()=>{child.exitCode=0;queueMicrotask(()=>child.emit('close',0));};
  child.stdin.on('data',chunk=>{const request=JSON.parse(chunk);assert.equal(request.type,'compact');queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'response',id:request.id,success,data:{summary:'short'},error:success?undefined:'failed'})+'\n'));});return child;
 };
}
test('native command uses exact current session and receives real RPC response',async()=>{
 assert.deepEqual(await executePiCommand(spec,'compact',{spawnProcess:mock()}),{summary:'short'});
 await assert.rejects(executePiCommand(spec,'compact',{spawnProcess:mock(false)}),/failed/);
 await assert.rejects(executePiCommand(spec,'clear',{spawnProcess:mock()}),/尚未接入/);
 await assert.rejects(executePiCommand({...spec,runtimeProfile:{adapter:'codex-cli'}},'compact'),/未使用 Pi/);
});
