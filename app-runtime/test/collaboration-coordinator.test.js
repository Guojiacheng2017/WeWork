import assert from 'node:assert/strict';
import test from 'node:test';
import { WeWorkService } from '../src/host/wework-service.js';
import { CollaborationCoordinator } from '../src/host/collaboration-coordinator.js';
import { MemoryWeWorkStorage } from '../../src/local/localWeWorkApi.ts';
import { createWeWorkTools } from '../src/wework-tools.js';

async function setup(t, weworkOptions = {}) {
  const wework = new WeWorkService(new MemoryWeWorkStorage(), weworkOptions);
  const profile = await wework.api.createRuntimeProfile({ name: 'test', adapter: 'smalldash', model: { provider: 'test', modelId: 'test' }, enabled: true, systemPrompt: '', thinkingLevel: 'off' });
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' });
  const lead = team.employees[0];
  const target = await wework.api.addEmployee(team.id, { displayName: 'Target', roleName: 'Reviewer', runtime: 'Workspace', defaultRuntimeProfileId: profile.id });
  await wework.api.updateEmployee(lead.id, { displayName: lead.displayName, roleName: lead.roleName, runtime: 'Workspace', skills: [], defaultRuntimeProfileId: profile.id });
  const runs = new Map(), specs = [], active = new Map();
  const runtime = { active, async start(spec) { specs.push(spec); const run = { id: spec.id, status: 'running', employeeId: spec.employeeId }; runs.set(spec.id, run); active.set(spec.id, run); return run; }, async get(id) { return runs.get(id); }, async cancelAndWait(id) { runs.get(id).status = 'cancelled'; active.delete(id); } };
  const coordinator = new CollaborationCoordinator({ wework, runtime, intervalMs: 100000 });
  wework.attachCoordinator(coordinator); t.after(() => coordinator.close());
  return { wework, team, lead, target, runtime, coordinator, runs, specs, profile };
}
test('Host-internal group runs resolve an explicit current-directory assignment', async (t) => {
  const { wework, team, coordinator, specs } = await setup(t, { currentWorkspace: async () => ({ kind: 'local', rootPath: '/app-current' }) });
  await wework.api.updateTeamWorkspace(team.id, { kind: 'local' });
  await wework.api.postGroupMessage(team.id, { text: 'Use current', requestId: 'current' });
  await coordinator.drain();
  assert.deepEqual(specs[0].workspace, { kind: 'local', rootPath: '/app-current' });
});
test('Host drains without renderer, publishes only terminal results, isolates group session', async (t) => {
  const { wework, team, lead, coordinator, runs, specs, runtime } = await setup(t);
  await wework.api.sendMessage(lead.id, 'PRIVATE');
  const message = await wework.api.postGroupMessage(team.id, { text: 'Public request', requestId: 'request' });
  await coordinator.drain(); await coordinator.drain();
  assert.equal(specs.length, 1); assert.ok(specs[0].session.id.includes('-group-'));
  assert.equal(JSON.stringify(specs[0]).includes('PRIVATE'), false);
  await wework.finish(specs[0], { finalText: 'Premature' });
  assert.equal((await wework.api.snapshot()).teams[0].teamMessages.length, 1);
  const run = runs.get(specs[0].id); run.status = 'succeeded'; run.finalText = 'Done'; runtime.active.delete(run.id);
  await coordinator.drain(); await coordinator.drain();
  const saved = (await wework.api.snapshot()).teams[0];
  assert.equal(saved.teamMessages.length, 2); assert.equal(saved.teamMessages[1].replyToMessageId, message.id);
  assert.equal(saved.employees[0].activeSession.messages.length, 1);
});
test('missing run after reservation becomes uncertain and is never replayed', async (t) => {
  const { wework, team, coordinator, specs } = await setup(t);
  const message = await wework.api.postGroupMessage(team.id, { text: 'Public request', requestId: 'request' });
  await wework.api.reserveGroupDelivery(team.id, message.deliveryId, 'missing-run');
  await coordinator.recover(); await coordinator.drain();
  assert.equal(specs.length, 0);
  assert.equal((await wework.api.snapshot()).teams[0].collaborationDeliveries[0].status, 'uncertain');
});
test('handoff awaits verified cancellation; failure preserves owner', async (t) => {
  const { wework, team, lead, target, runtime } = await setup(t);
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: '', priority: 'low', category: 'Digital' });
  await wework.api.assignWork(work.id, lead.id);
  const request = await wework.api.requestHandoff(work.id, { targetEmployeeId: target.id, note: 'transfer' });
  runtime.active.set('active-run', { employeeId: lead.id });
  runtime.cancelAndWait = async () => { throw new Error('RUN_CANCEL_TIMEOUT'); };
  await assert.rejects(wework.call('decideHandoff', [team.id, { handoffId: request.id, decision: 'accepted' }]), /TIMEOUT/);
  assert.equal((await wework.api.snapshot()).teams[0].employees[0].currentWorkItem.id, work.id);
  let stopped = false;
  runtime.cancelAndWait = async () => { stopped = true; runtime.active.delete('active-run'); };
  runtime.get = async () => ({ status: stopped ? 'cancelled' : 'running' });
  await wework.call('decideHandoff', [team.id, { handoffId: request.id, decision: 'accepted' }]);
  assert.equal(stopped, true);
  assert.equal((await wework.api.snapshot()).teams[0].employees.find((b) => b.id === target.id).currentWorkItem.id, work.id);
});
test('group tools reject forged identity and cannot accept deliveries or mutate private tasks', async (t) => {
  const { wework, team, coordinator, specs } = await setup(t);
  await wework.api.postGroupMessage(team.id, { text: 'Talk', requestId: 'request' }); await coordinator.drain();
  const tools = createWeWorkTools(wework, specs[0]);
  assert.equal(tools.some((tool) => /submit|handoff|save_output|review/.test(tool.name)), false);
  const message = tools.find((tool) => tool.name === 'wework_send_team_message');
  await assert.rejects(message.execute('id', { text: 'fake', employeeId: 'other' }), /invalid/);
  await message.execute('id', { text: 'Public progress' });
  assert.equal((await wework.api.snapshot()).teams[0].collaborationDeliveries.length, 1);
});

test('admission and handoff cannot cross the prepare/start gap', async (t) => {
  const { wework, team, lead, target, runtime } = await setup(t);
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: '', priority: 'low', category: 'Digital' });
  await wework.api.assignWork(work.id, lead.id);
  const handoff = await wework.api.requestHandoff(work.id, { targetEmployeeId: target.id, note: 'transfer' });
  let release, entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  runtime.start = async () => { entered(); await new Promise((resolve) => { release = resolve; }); return { id: 'r', status: 'running' }; };
  const starting = wework.startRun({ id: 'r', employeeId: lead.id, workId: work.id }, runtime);
  await ready;
  await assert.rejects(wework.call('decideHandoff', [team.id, { handoffId: handoff.id, decision: 'accepted' }]), /transition/);
  release(); await starting;
  assert.equal((await wework.api.snapshot()).teams[0].employees[0].currentWorkItem.id, work.id);
});

test('late group tools fail after cancellation; duplicate explicit replies do not redispatch', async (t) => {
  const { wework, team, coordinator, specs, runs, runtime } = await setup(t);
  await wework.api.postGroupMessage(team.id, { text: 'Talk', requestId: 'request' }); await coordinator.drain();
  const send = createWeWorkTools(wework, specs[0]).find((tool) => tool.name === 'wework_send_team_message');
  await send.execute('call-1', { text: 'Progress' }); await send.execute('call-1', { text: 'Progress' });
  assert.equal((await wework.api.snapshot()).teams[0].teamMessages.length, 2);
  const run = runs.get(specs[0].id); run.status = 'cancelled'; runtime.active.delete(run.id);
  await coordinator.drain();
  await assert.rejects(send.execute('late', { text: 'Too late' }), /no longer active/);
});

test('real RuntimeManager handoff waits for executor settlement and terminal persistence', async (t) => {
  const { wework, team, lead, target, coordinator: previous } = await setup(t);
  await previous.close();
  const { RuntimeManager } = await import('../src/host/runtime-manager.js');
  const { CheckpointStore } = await import('../src/host/checkpoint-store.js');
  const { EventJournal } = await import('../src/host/server.js');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'wework-real-handoff-'));
  let release, started, cancelled;
  const entered = new Promise((resolve) => { started = resolve; });
  const aborted = new Promise((resolve) => { cancelled = resolve; });
  const manager = new RuntimeManager({ store: new CheckpointStore(root), journal: new EventJournal(),
    execute: async (_spec, { signal }) => {
      started();
      signal.addEventListener('abort', () => cancelled(), { once: true });
      await new Promise((resolve) => { release = resolve; });
      throw signal.reason;
    }, onFinish: (...args) => wework.finish(...args) });
  const coordinator = new CollaborationCoordinator({ wework, runtime: manager, intervalMs: 100000 });
  wework.attachCoordinator(coordinator);
  t.after(async () => { await coordinator.close(); await rm(root, { recursive: true, force: true }); });
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: '', priority: 'low', category: 'Digital' });
  await wework.api.assignWork(work.id, lead.id);
  await wework.startRun({ id: 'real-run', employeeId: lead.id, workId: work.id }, manager);
  await entered;
  const handoff = await wework.api.requestHandoff(work.id, { targetEmployeeId: target.id, note: 'transfer' });
  const deciding = wework.call('decideHandoff', [team.id, { handoffId: handoff.id, decision: 'accepted' }]);
  await aborted;
  assert.equal((await wework.api.snapshot()).teams[0].employees[0].currentWorkItem.id, work.id);
  assert.equal((await manager.get('real-run')).status, 'running');
  release(); await deciding;
  assert.equal((await manager.get('real-run')).status, 'cancelled');
  assert.equal(manager.active.has('real-run'), false);
  assert.equal((await wework.api.snapshot()).teams[0].employees.find((b) => b.id === target.id).currentWorkItem.id, work.id);
});

test('cancel delivery preserves running state on timeout and only marks cancelled after stop', async (t) => {
  const { wework, team, runtime, coordinator, specs } = await setup(t);
  const message = await wework.api.postGroupMessage(team.id, { text: 'Run', requestId: 'cancel-test' });
  await coordinator.drain();
  const original = runtime.cancelAndWait;
  runtime.cancelAndWait = async () => { throw new Error('RUN_CANCEL_TIMEOUT'); };
  await assert.rejects(wework.call('cancelGroupDelivery', [team.id, message.deliveryId]), /TIMEOUT/);
  assert.equal((await wework.api.snapshot()).teams[0].collaborationDeliveries[0].status, 'running');
  runtime.cancelAndWait = original;
  assert.equal((await wework.call('cancelGroupDelivery', [team.id, message.deliveryId])).status, 'cancelled');
  assert.equal((await runtime.get(specs[0].id)).status, 'cancelled');
  assert.equal((await wework.call('cancelGroupDelivery', [team.id, message.deliveryId])).status, 'cancelled');
});

test('completion during checkpoint read is not mistaken for an interrupted session', async (t) => {
  const { wework, team, coordinator, runtime, specs } = await setup(t);
  const message = await wework.api.postGroupMessage(team.id, {text:'Hello',requestId:'race'});
  await coordinator.drain();
  const id = specs[0].id;
  let reads = 0;
  runtime.get = async () => {
    reads++;
    runtime.active.delete(id);
    return reads === 1 ? {id,status:'running'} : {id,status:'succeeded',finalText:'Completed'};
  };
  await coordinator.drain();
  const delivery = (await wework.api.snapshot()).teams[0].collaborationDeliveries.find(item => item.id === message.deliveryId);
  assert.equal(delivery.status, 'succeeded');
});
