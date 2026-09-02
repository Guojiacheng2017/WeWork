import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeWorkService, FileWeWorkStorage } from '../src/host/wework-service.js';
import { CollaborationCoordinator } from '../src/host/collaboration-coordinator.js';
import { RuntimeManager } from '../src/host/runtime-manager.js';
import { CheckpointStore } from '../src/host/checkpoint-store.js';
import { EventJournal } from '../src/host/server.js';
import { createWeWorkTools } from '../src/wework-tools.js';
import { executeSmalldashRun } from '../src/smalldash-runtime.js';

test('durable group inbox runs bundled sdh with real IPC tools and resumes only public history', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    const delta = requests.length === 1
      ? { tool_calls: [{ index: 0, id: 'read-team', type: 'function', function: { name: 'wework_get_team', arguments: '{}' } }] }
      : { content: 'PUBLIC-RESULT' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = await mkdtemp(join(tmpdir(), 'wework-group-sdh-'));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'wework.json')));
  const profile = await wework.api.createRuntimeProfile({ name: 'Group SDH', adapter: 'smalldash', enabled: true, systemPrompt: '', thinkingLevel: 'off',
    model: { provider: 'fixture', modelId: 'group-fixture', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindow: 8192, maxTokens: 512 } });
  const team = await wework.api.createTeam({ name: 'PUBLIC-TEAM', runtime: 'Workspace' });
  const employee = team.employees[0];
  await wework.api.updateEmployee(employee.id, { displayName: employee.displayName, roleName: employee.roleName, runtime: 'Workspace', skills: [], defaultRuntimeProfileId: profile.id, workspaceAssignment: { kind: 'local', rootPath: root } });
  await wework.api.sendMessage(employee.id, 'PRIVATE-WORKBENCH-MUST-NOT-LEAK');
  const runtime = new RuntimeManager({ store: new CheckpointStore(join(root, 'runs')), journal: new EventJournal(),
    execute: (spec, options) => executeSmalldashRun(spec, { ...options, dataRoot: root, tools: createWeWorkTools(wework, spec, options.signal) }),
    onFinish: (...args) => wework.finish(...args) });
  const coordinator = new CollaborationCoordinator({ wework, runtime, intervalMs: 10 }); wework.attachCoordinator(coordinator);
  t.after(async () => { await coordinator.close(); await Promise.allSettled([...runtime.active.keys()].map((id) => runtime.cancelAndWait(id))); await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const runMessage = async (input) => {
    const message = await wework.call('postGroupMessage', [team.id, input]);
    for (let i = 0; i < 500; i++) {
      const current = (await wework.api.snapshot()).teams[0].collaborationDeliveries.find((d) => d.id === message.deliveryId);
      if (['succeeded', 'failed', 'uncertain'].includes(current.status)) { assert.equal(current.status, 'succeeded', current.error); return current; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('group delivery did not settle');
  };
  const first = await runMessage({ text: 'Read our team and reply', requestId: 'one' });
  const second = await runMessage({ text: 'Continue public discussion', requestId: 'two' });
  assert.equal(requests[0].model, 'group-fixture');
  assert.ok(requests[1].messages.some((m) => m.role === 'tool' && m.content.includes('PUBLIC-TEAM')));
  assert.equal(JSON.stringify(requests).includes('PRIVATE-WORKBENCH-MUST-NOT-LEAK'), false);
  assert.ok(requests.at(-1).messages.some((m) => m.role === 'assistant' && m.content === 'PUBLIC-RESULT'));
  assert.equal((await runtime.get(first.runId)).sessionId, (await runtime.get(second.runId)).sessionId);
  const persisted = (await new WeWorkService(new FileWeWorkStorage(join(root, 'wework.json'))).api.snapshot()).teams[0];
  assert.equal(persisted.teamMessages.filter((m) => m.finalReply).length, 2);
  assert.equal(persisted.employees[0].activeSession.messages.length, 1);
});
