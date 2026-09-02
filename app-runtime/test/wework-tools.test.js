import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeWorkService, FileWeWorkStorage } from '../src/host/wework-service.js';
import { createWeWorkTools } from '../src/wework-tools.js';
import { executeRun } from '../src/runtime.js';
import { RuntimeManager } from '../src/host/runtime-manager.js';
import { CheckpointStore } from '../src/host/checkpoint-store.js';
import { EventJournal } from '../src/host/server.js';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'wework-tools-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'wework.json')));
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' });
  const employeeId = team.employees[0].id;
  const profile = await wework.api.createRuntimeProfile({ name: 'Pi', adapter: 'pi', model: { provider: 'openai', modelId: 'test', credentialRef: 'vault:model' }, thinkingLevel: 'off', enabled: true, systemPrompt: '' });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id });
  const work = await wework.api.createWork(team.id, { title: 'Analysis', goal: 'Use inputs', priority: 'medium', category: 'Digital' });
  await wework.api.assignWork(work.id, employeeId);
  await wework.api.saveWorkDocument(work.id, { title: 'Source', kind: 'input', content: 'Evidence input' });
  const spec = await wework.prepare({ id: 'run-1', employeeId, workId: work.id, employee: { displayName: 'SPOOF' } });
  return { root, wework, team, employeeId, work, spec };
}

test('real run path registers tools, writes evidence and persists output without auto-accepting', async (t) => {
  const { root, wework, employeeId, work, spec } = await setup(t);
  class FakeAgent {
    constructor(options) { this.tools = options.initialState.tools; this.state = { messages: [] }; this.sessionId = options.sessionId; }
    async prompt(prompt) {
      assert.match(prompt, /Evidence input/);
      const call = async (name, args) => (await this.tools.find((tool) => tool.name === name).execute('call', args)).details;
      await call('wework_report_progress', { summary: 'Examining evidence', nextStep: 'write report' });
      const output = await call('wework_save_output', { title: 'Report', content: 'Evidence-backed output' });
      await call('wework_submit_deliverable', { summary: 'Report ready', documentIds: [output.id], evidence: 'Checked against source' });
      this.state.messages = [{ role: 'assistant', content: 'Submitted for review.' }];
    }
    async waitForIdle() {}
  }
  const manager = new RuntimeManager({
    store: new CheckpointStore(join(root, 'runs')), journal: new EventJournal(),
    execute: (value, options) => executeRun(value, { ...options, apiKey: 'test-key', tools: createWeWorkTools(wework, value, options.signal) }, FakeAgent),
    onFinish: (...args) => wework.finish(...args),
  });
  await manager.start(spec);
  let terminal;
  for (let i = 0; i < 100; i++) {
    terminal = await manager.get(spec.id);
    if (['succeeded', 'failed'].includes(terminal.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(terminal.status, 'succeeded', terminal.error);
  const restarted = new WeWorkService(new FileWeWorkStorage(join(root, 'wework.json')));
  const current = (await restarted.api.snapshot()).teams[0].employees[0].currentWorkItem;
  assert.equal(current.status, 'running');
  assert.equal(current.deliveryStatus, 'submitted');
  assert.equal(current.records.deliverables[0].actor.runId, spec.id);
  assert.equal(terminal.weworkContext.manifest.documentIds.length, 1);
  await assert.rejects(wework.api.completeCurrent(employeeId), /accepted deliverable/);
  await wework.api.reviewDeliverable(work.id, { deliverableId: current.records.deliverables[0].id, decision: 'accepted', feedback: 'Reviewed by user' });
  await wework.api.completeCurrent(employeeId);
});

test('tool boundary rejects identity injection, cancellation, cross-work reads and stale ownership', async (t) => {
  const { wework, employeeId, spec } = await setup(t);
  assert.equal(spec.employee.displayName, 'Worker');
  const controller = new AbortController();
  const tools = createWeWorkTools(wework, spec, controller.signal);
  assert.equal(tools.some((tool) => /review|complete/.test(tool.name)), false);
  const report = tools.find((tool) => tool.name === 'wework_report_progress');
  await assert.rejects(report.execute('c', { summary: 'fake', employeeId: 'other' }), /invalid WeWork tool arguments/);
  const roster = await tools.find((tool) => tool.name === 'wework_get_team').execute('c', {});
  assert.equal(JSON.stringify(roster).includes('vault:model'), false);
  await assert.rejects(tools.find((tool) => tool.name === 'wework_read_document').execute('c', { documentId: 'foreign-document' }), /not found/);
  await wework.api.returnCurrent(employeeId);
  await assert.rejects(report.execute('c', { summary: 'stale' }), /no longer owns/);
  controller.abort();
  await assert.rejects(report.execute('c', { summary: 'cancelled' }), /cancelled/);
  await assert.rejects(wework.call('constructor'), /unsupported/);
});

test('checkpoint isolation and duplicate employee/run protection', async (t) => {
  const { root, spec } = await setup(t);
  const store = new CheckpointStore(join(root, 'runs'));
  await store.putCheckpoint('different-session', { messages: [{ role: 'user', content: 'private' }] });
  let release;
  const manager = new RuntimeManager({ store, journal: new EventJournal(), execute: async (input) => {
    assert.equal(input.session.messages.length, 0);
    await new Promise((resolve) => { release = resolve; });
    return { messages: [], finalText: 'ok' };
  } });
  await manager.start(spec);
  await assert.rejects(manager.start({ ...spec, id: 'run-2' }), /already has an active/);
  for (let i = 0; !release && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  release();
  for (let i = 0; i < 100 && (await manager.get(spec.id)).status !== 'succeeded'; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(manager.start(spec), /already|used/);
});

test('session execution remains authoritative after the legacy profile changes', async (t) => {
  const { root, wework, employeeId, work } = await setup(t);
  const before = await wework.prepare({ id: 'authority-1', employeeId, workId: work.id });
  const changed = await wework.api.createRuntimeProfile({ name: 'Changed', adapter: 'smalldash', model: { provider: 'other', modelId: 'other-model' }, thinkingLevel: 'high', enabled: true, systemPrompt: 'other' });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'DSH', skills: [], defaultRuntimeProfileId: changed.id });
  const afterBinding = await wework.prepare({ id: 'authority-2', employeeId, workId: work.id });
  assert.equal(before.runtimeProfile.model.modelId, 'test');
  assert.equal(afterBinding.runtimeProfile.model.modelId, 'other-model');
  const storage = new FileWeWorkStorage(join(root, 'wework.json'));
  const persisted = JSON.parse(storage.getItem());
  persisted.runtimeProfiles.find((profile) => profile.id === changed.id).model.modelId = 'mutated-device-setting';
  storage.setItem('', JSON.stringify(persisted));
  const after = await wework.prepare({ id: 'authority-3', employeeId, workId: work.id });
  assert.equal(after.runtimeProfile.model.modelId, 'other-model');
});

test('Host update boundary rejects a renderer session execution downgrade', async (t) => {
  const { wework, employeeId } = await setup(t);
  const employee = (await wework.api.snapshot()).teams[0].employees[0];
  const current = employee.activeSession.execution;
  const next = { ...current, profileRevision: current.profileRevision + 1, model: { ...current.model, modelId: 'employee-owned' } };
  await wework.call('updateEmployee', [employeeId, { displayName: employee.displayName, roleName: employee.roleName, runtime: employee.runtime, skills: [], sessionExecution: next }]);
  await assert.rejects(wework.call('updateEmployee', [employeeId, { displayName: employee.displayName, roleName: employee.roleName, runtime: employee.runtime, skills: [], sessionExecution: current }]), (error) => error.code === 'SESSION_EXECUTION_STALE');
  assert.equal((await wework.api.snapshot()).teams[0].employees[0].activeSession.execution.model.modelId, 'employee-owned');
});

test('changed inputs during a run require rereading context before submission', async (t) => {
  const { wework, work, spec } = await setup(t);
  const tools = createWeWorkTools(wework, spec);
  const output = (await tools.find((tool) => tool.name === 'wework_save_output').execute('save', { title: 'Draft', content: 'old result' })).details;
  await wework.api.saveWorkDocument(work.id, { title: 'New constraint', kind: 'decision', content: 'Use a different method' });
  const submit = tools.find((tool) => tool.name === 'wework_submit_deliverable');
  const input = { summary: 'result', documentIds: [output.id], evidence: 'checked' };
  await assert.rejects(submit.execute('submit', input), /inputs changed during execution/);
  await tools.find((tool) => tool.name === 'wework_get_task_context').execute('read', {});
  assert.ok((await submit.execute('submit', input)).details.id);
});

test('capability registry controls Agent project tool exposure', async (t) => {
  const { wework, team, employeeId, work } = await setup(t);
  const lightweight = await wework.prepare({ id: 'capability-1', employeeId, workId: work.id });
  assert.equal(createWeWorkTools(wework, lightweight).some((tool) => tool.name.startsWith('wework_project_')), false);

  await wework.api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: true, capabilities: ['issues', 'board'] } });
  const enabled = await wework.prepare({ id: 'capability-2', employeeId, workId: work.id });
  const enabledTools = createWeWorkTools(wework, enabled);
  const names = enabledTools.map((tool) => tool.name);
  assert.equal(names.includes('wework_project_list_issues'), true);
  assert.equal(names.includes('wework_project_move_board_item'), true);
  assert.equal(names.includes('wework_project_schedule_gantt_item'), false);

  await wework.api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: false, capabilities: ['issues', 'board'] } });
  await assert.rejects(enabledTools.find((tool) => tool.name === 'wework_project_list_issues').execute('stale', {}), /no longer enabled/);
  const disabled = await wework.prepare({ id: 'capability-3', employeeId, workId: work.id });
  assert.equal(createWeWorkTools(wework, disabled).some((tool) => tool.name.startsWith('wework_project_')), false);
});
