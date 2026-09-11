import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executePiRun } from '../src/pi-runtime.js';

const spec = (workspace = process.cwd()) => ({ id: 'pi-run', employeeId: 'employee', runtimeProfile: { id: 'pi-config', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, systemPrompt: 'Be precise.', thinkingLevel: 'medium' }, employee: { displayName: 'Pi Worker', roleName: 'Engineer' }, work: { title: 'Task', goal: 'Finish it' }, workspace: { kind: 'local', rootPath: workspace }, session: { id: 'wework-session' } });

function fakeRpc(onPrompt) {
  return (_file, args, options) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.exitCode = null; child.killed = false; child.kill = () => { child.killed = true; child.exitCode = 0; queueMicrotask(() => child.emit('close', 0)); };
    let buffer = ''; const output = (value) => child.stdout.write(`${JSON.stringify(value)}\n`);
    child.stdin.on('data', (chunk) => { buffer += chunk; for (;;) { const newline = buffer.indexOf('\n'); if (newline < 0) break; const command = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      if (command.type === 'prompt') { output({ id: command.id, type: 'response', command: 'prompt', success: true }); void Promise.resolve(onPrompt?.({ args, options, output })).then(() => { output({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'streamed' } }); output({ type: 'tool_execution_end', toolName: 'wework_report_progress' }); output({ type: 'agent_settled' }); }); }
      else if (command.type === 'get_last_assistant_text') output({ id: command.id, type: 'response', command: command.type, success: true, data: { text: 'done' } });
      else if (command.type === 'get_messages') output({ id: command.id, type: 'response', command: command.type, success: true, data: { messages: [{ role: 'assistant', content: 'done' }] } });
      else if (command.type === 'get_session_stats') output({ id: command.id, type: 'response', command: command.type, success: true, data: { tokens: { input: 4, output: 2, cacheRead: 1, cacheWrite: 0, total: 7 }, contextUsage: { tokens: 60, contextWindow: 200, percent: 30 } } });
      else if (command.type === 'abort') { output({ type: 'response', command: 'abort', success: true }); child.kill(); }
    } });
    child.stdin.on('finish', () => { child.exitCode = 0; queueMicrotask(() => child.emit('close', 0)); }); return child;
  };
}

test('Pi RPC uses Harness-owned auth/default model and bridges WeWork tools', async () => {
  const events = []; let invocation;
  const tool = { name: 'wework_report_progress', label: 'Progress', description: 'Report progress', parameters: { type: 'object', properties: {}, additionalProperties: false }, async execute(callId, args) { invocation = { callId, args }; return { content: [{ type: 'text', text: 'ok' }] }; } };
  const spawnProcess = fakeRpc(async ({ args, options }) => {
    assert.equal(args.includes('--api-key'), false); assert.equal(args.includes('--provider'), false); assert.equal(args.includes('--model'), false);
    const definitions = JSON.parse(Buffer.from(options.env.WEWORK_PI_TOOL_DEFINITIONS, 'base64').toString()); assert.equal(definitions[0].name, tool.name);
    const response = await fetch(options.env.WEWORK_PI_TOOL_URL, { method: 'POST', headers: { authorization: `Bearer ${options.env.WEWORK_PI_TOOL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: tool.name, callId: 'call-1', arguments: {} }) }); assert.equal(response.status, 200);
  });
  const result = await executePiRun(spec(), { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess, tools: [tool], emit: (event) => events.push(event) });
  assert.equal(result.nativeSessionId, 'wework-session'); assert.equal(result.finalText, 'done'); assert.deepEqual(result.usage, { input: 4, output: 2, cacheRead: 1, cacheWrite: 0, total: 7, context: { tokens: 60, harnessContextWindow: 200, modelContextWindow: 200, effectiveLimit: 160, percent: 37.5 } }); assert.deepEqual(invocation, { callId: 'call-1', args: {} }); assert.deepEqual(events, [{ type: 'assistant.delta', text: 'streamed' }, { type: 'assistant.activity', activity: 'tool', text: 'wework_report_progress 完成' }, { type: 'wework.updated' }]);
});

test('employee may request a Pi-discovered model without WeWork connection settings', async () => {
  let captured;
  const selected = spec(); selected.runtimeProfile.model = { provider: 'anthropic', modelId: 'claude-sonnet' };
  await executePiRun(selected, { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess: fakeRpc(({ args }) => { captured = args; }) });
  assert.deepEqual(captured.slice(captured.indexOf('--model'), captured.indexOf('--model') + 2), ['--model', 'anthropic/claude-sonnet']);
  assert.equal(captured.includes('--api-key'), false);
});

test('Windows Pi RPC starts an npm cmd shim through the PowerShell relay', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-pi-windows-'));
  const executablePath = join(root, 'pi.cmd');
  const wrapperPath = join(root, 'pi-command-wrapper.ps1');
  await writeFile(executablePath, '@echo off');
  await writeFile(wrapperPath, '');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  let invocation;
  const rpc = fakeRpc();

  await executePiRun(spec(), {
    platform: 'win32', executablePath, extensionPath: '/tmp/pi-wework-extension.mjs', windowsCommandWrapperPath: wrapperPath,
    spawnProcess: (file, args, options) => { invocation = { file, args }; return rpc(file, args, options); },
  });

  assert.equal(invocation.file, 'powershell.exe');
  assert.deepEqual(invocation.args.slice(0, 8), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath, executablePath]);
  assert.ok(invocation.args.includes('--mode'));
  assert.ok(invocation.args.includes('rpc'));
});

test('Pi receives global, team and employee WEWORK.md layers as system instructions', async () => {
  let captured;
  const configured = { ...spec(), weworkPrompts: [{ scope: 'global', content: 'Global policy' }, { scope: 'team', content: 'Team policy' }, { scope: 'employee', content: 'Employee persona' }] };
  await executePiRun(configured, { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess: fakeRpc(({ args }) => { captured = args; }) });
  const prompt = captured[captured.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /Global policy[\s\S]*Team policy[\s\S]*Employee persona[\s\S]*Be precise\./);
});

test('Pi receives only explicitly assigned WeWork business skills', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-pi-skill-'));
  const assigned = join(root, 'assigned');
  const unassigned = join(root, 'unassigned');
  await mkdir(assigned, { recursive: true }); await mkdir(unassigned, { recursive: true });
  await writeFile(join(assigned, 'SKILL.md'), '---\nname: Assigned\ndescription: assigned business skill\n---\nASSIGNED_SKILL_BODY');
  await writeFile(join(unassigned, 'SKILL.md'), '---\nname: Unassigned\ndescription: unassigned business skill\n---\nUNASSIGNED_SKILL_BODY');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true })));
  let captured;
  const configured = { ...spec(), employee: { displayName: 'Pi Worker', roleName: 'Engineer', skills: [{ id: 'assigned', name: 'Assigned' }] }, skillRoots: [root] };
  await executePiRun(configured, { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess: fakeRpc(({ args }) => { captured = args; }) });
  const prompt = captured[captured.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /ASSIGNED_SKILL_BODY/);
  assert.doesNotMatch(prompt, /UNASSIGNED_SKILL_BODY/);
});

test('Pi rejects SSH workspace until a remote Pi adapter exists', async () => {
  await assert.rejects(executePiRun({ ...spec(), workspace: { kind: 'ssh' } }, {}), (error) => error.code === 'PI_WORKSPACE_UNSUPPORTED');
});

test('Pi cancellation sends RPC abort and waits for process shutdown', async () => {
  const controller = new AbortController(); let child;
  const spawnProcess = (...args) => { child = fakeRpc(() => new Promise(() => {}))(...args); return child; };
  const running = executePiRun(spec(), { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve)); controller.abort(new Error('cancelled'));
  await assert.rejects(running); assert.equal(child.killed, true);
});

test('Pi forwards steering to the existing RPC child while the prompt is active',async()=>{
 const done=Promise.withResolvers(), ready=Promise.withResolvers();let received;let controls;
 const base=fakeRpc(()=>done.promise);
 const spawnProcess=(...args)=>{const child=base(...args);child.stdin.on('data',chunk=>{const command=JSON.parse(chunk.toString());if(command.type==='steer'){received=command.message;child.stdout.write(JSON.stringify({id:command.id,type:'response',success:true})+'\n')}});return child};
 const running=executePiRun(spec(),{executablePath:process.execPath,extensionPath:'/tmp/pi-wework-extension.mjs',spawnProcess,registerControls:value=>{controls=value;if(value)ready.resolve()}});
 await ready.promise;await controls.steer('Use the revised goal');assert.equal(received,'Use the revised goal');done.resolve();await running;assert.equal(controls,null);
});

test('missing employee workspace fails before spawning instead of leaving a running prompt', async () => {
  await assert.rejects(executePiRun(spec('/tmp/wework-missing-directory-937241'), {
    spawnProcess: () => { throw new Error('must not spawn'); },
  }), error => error.code === 'PI_WORKSPACE_MISSING');
});

for (const phase of ['prompt', 'get_last_assistant_text']) {
  test(`Pi exit during ${phase} rejects the waiting request`, { timeout: 2000 }, async () => {
    const spawnProcess = () => {
      const child = new EventEmitter();
      Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), exitCode: null, killed: false });
      child.kill = () => { child.killed = true; child.exitCode = 1; child.emit('close', 1); };
      child.stdin.on('data', chunk => {
        const request = JSON.parse(chunk.toString());
        queueMicrotask(() => {
          if (request.type === phase) { child.stderr.write('test executor startup failure'); child.kill(); }
          else if (request.type === 'prompt') {
            child.stdout.write(JSON.stringify({ type: 'response', id: request.id, success: true }) + '\n');
            child.stdout.write(JSON.stringify({ type: 'agent_settled' }) + '\n');
          }
        });
      });
      return child;
    };
    await assert.rejects(executePiRun(spec(), { executablePath: process.execPath, extensionPath: '/tmp/pi-wework-extension.mjs', spawnProcess }), /test executor startup failure/);
  });
}
