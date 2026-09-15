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

test('Session permission mode scopes injected tools and rejects mid-run changes', async (t) => {
  const { wework, employeeId, work } = await setup(t);
  const employee = (await wework.api.snapshot()).teams[0].employees[0];
  const updateMode = (sessionPermissionMode) => wework.api.updateEmployee(employeeId, { displayName: employee.displayName, roleName: employee.roleName, runtime: employee.runtime, skills: [], sessionPermissionMode });

  await updateMode('ask');
  const supervisedSpec = await wework.prepare({ id: 'permission-ask', employeeId, workId: work.id });
  const supervised = createWeWorkTools(wework, supervisedSpec);
  assert.equal(supervised.some((tool) => tool.name === 'wework_get_task_context'), true);
  assert.equal(supervised.some((tool) => tool.name === 'wework_save_output'), false);
  assert.equal(supervised.some((tool) => tool.name === 'wework_start_dag'), false);
  assert.equal(supervised.some((tool) => tool.name === 'wework_save_dag'), false);

  await updateMode('auto');
  const automaticSpec = await wework.prepare({ id: 'permission-auto', employeeId, workId: work.id });
  const automatic = createWeWorkTools(wework, automaticSpec);
  assert.equal(automatic.some((tool) => tool.name === 'wework_save_output'), true);
  assert.equal(automatic.some((tool) => tool.name === 'wework_request_handoff'), false);

  await updateMode('full');
  const unrestrictedSpec = await wework.prepare({ id: 'permission-full', employeeId, workId: work.id });
  assert.equal(createWeWorkTools(wework, unrestrictedSpec).some((tool) => tool.name === 'wework_request_handoff'), true);
  await updateMode('ask');
  await assert.rejects(createWeWorkTools(wework, unrestrictedSpec).find((tool) => tool.name === 'wework_request_handoff').execute('stale-permission', { targetEmployeeId: employeeId, note: 'test' }), /permissions changed/);
});

test('lead edits DAG; members can change status but cannot edit DAG or Gantt even with full access', async t => {
  const { wework, team, employeeId, work } = await setup(t);
  await wework.api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: true, capabilities: ['issues', 'board', 'gantt'] } });
  const spec = await wework.prepare({ id: 'dag-lead', employeeId, workId: work.id });
  const tools = createWeWorkTools(wework, spec);
  const save = tools.find(t => t.name === 'wework_save_dag');
  const current = (await tools.find(t => t.name === 'wework_get_dag').execute('read', {})).details;
  const input = { expectedVersion: current.version ?? 0, name: 'Delivery', nodes: [{ id: 'a', label: 'Draft', roleName: 'Writer', assignedEmployeeId: employeeId }, { id: 'b', label: 'Review', roleName: 'Reviewer', requires: ['a'] }] };
  const saved = (await save.execute('save', input)).details;
  assert.equal(saved.nodes[1].requires[0], 'a');
  await assert.rejects(save.execute('stale', input), /version conflict/);
  await assert.rejects(save.execute('cycle', { ...input, expectedVersion: saved.version, nodes: [{ id: 'a', label: 'A', roleName: 'Role', requires: ['a'] }] }), /cycle/);
  const member = await wework.api.addEmployee(team.id, { displayName: 'Member', roleName: 'Writer', runtime: 'Workspace', skills: [] });
  await wework.api.setLead(team.id, member.id);
  await assert.rejects(save.execute('demoted', { ...input, expectedVersion: saved.version }), /team lead/);
  const demoted = await wework.prepare({ id: 'dag-member', employeeId, workId: work.id });
  const names = createWeWorkTools(wework, { ...demoted, wework: { ...demoted.wework, permissionMode: 'full' } }).map(t => t.name);
  assert.ok(names.includes('wework_get_dag'));
  assert.ok(names.includes('wework_project_list_issues'));
  assert.ok(names.includes('wework_project_move_board_item'));
  for (const name of ['wework_save_dag', 'wework_project_create_issue', 'wework_project_schedule_gantt_item']) assert.equal(names.includes(name), false, name);
  const item = await wework.api.createCollaborationWorkItem(team.id, { projectId: 'project-main', title: 'Member status update' });
  const state = (await wework.api.snapshot()).teams[0];
  state.collaborationDatabase.assignees.push({ id: 'assignee-worker', employeeId, displayName: 'Worker' });
  await wework.api.replaceCollaborationDatabase(team.id, state.collaborationDatabase);
  await wework.api.updateCollaborationWorkItem(team.id, item.id, { assigneeIds: ['assignee-worker'] });
  const statusId = state.collaborationDatabase.statuses[1].id;
  const move = createWeWorkTools(wework, demoted).find(t => t.name === 'wework_project_move_board_item');
  const moved = await move.execute('member-status', { workItemId: item.id, statusId });
  assert.equal(moved.details.statusId, statusId);
  await assert.rejects(move.execute('invalid-status', { workItemId: item.id, statusId: 'missing' }), /invalid work item status/);
  await wework.api.updateCollaborationWorkItem(team.id, item.id, { assigneeIds: [] });
  await assert.rejects(move.execute('unassigned', { workItemId: item.id, statusId }), /assigned employee/);
  await wework.api.setLead(team.id, employeeId);
  await assert.rejects(move.execute('lead-not-owner', { workItemId: item.id, statusId }), /assigned employee/);
  await assert.rejects(wework.call('updateAssignedWorkItemStatus', [team.id, item.id, statusId]), /unsupported/);
});

test('every group member receives collaboration and roster tools in each permission mode', () => {
  for (const permissionMode of ['ask', 'auto', 'full']) {
    const tools = createWeWorkTools({}, { id: 'run', employeeId: 'member', wework: { group: true, chat: true, isLead: false, permissionMode } });
    assert.ok(tools.some(tool => tool.name === 'wework_request_collaboration'));
    assert.ok(tools.some(tool => tool.name === 'wework_get_team'));
    assert.ok(!tools.some(tool => tool.name === 'wework_save_dag'));
  }
});

test('DAG write tool persists explicit node positions', async (t) => {
  const { wework, spec } = await setup(t);
  const save = createWeWorkTools(wework, spec).find((tool) => tool.name === 'wework_save_dag');
  assert.equal(save.mutating, true);
  const result = await save.execute('layout', { expectedVersion: 0, name: 'Layout', nodes: [
    { id: 'node-1', roleName: 'Lead', label: 'Start', position: { x: 120, y: 240 } },
  ] });
  assert.deepEqual(result.details.nodes[0].position, { x: 120, y: 240 });
});

test('lead can start a saved DAG as real linked work through the WeWork tool', async (t) => {
  const { wework, team, employeeId, spec } = await setup(t);
  await wework.api.saveWorkflow(team.id, {
    id: 'wf-executable', name: 'Executable', description: '', nodes: [
      { id: 'stage-1', roleName: 'Analyst', label: 'Produce evidence', goal: 'Produce an accepted evidence document', assignedEmployeeId: employeeId, requires: [], stepNumber: 1, status: 'ready' },
    ],
  });
  const tools = createWeWorkTools(wework, spec);
  const started = (await tools.find((tool) => tool.name === 'wework_start_dag').execute('start', {})).details;
  assert.ok(started.nodes[0].workItemId);
  const snapshot = await wework.api.snapshot();
  assert.equal(snapshot.teams[0].employees[0].queuedWorkItems[0].workflowNodeId, 'stage-1');
});

test('team lead maintains work types and creates a temporary DAG from same-type history', async (t) => {
  const { wework, team, employeeId, spec } = await setup(t);
  const tools = createWeWorkTools(wework, spec);
  const configured = (await tools.find((tool) => tool.name === 'wework_configure_work_type').execute('type', {
    id: 'data', name: '数据工作', leadEmployeeId: employeeId, participantEmployeeIds: [employeeId], assignmentPolicy: 'balanced', assignmentWeights: { [employeeId]: 1 },
  })).details;
  assert.equal(configured.contextTagId, 'work-type:data');
  const template = await wework.api.createWorkflow(team.id, { name: '历史数据清洗', temporary: false, workTypeId: 'data' });
  await wework.api.selectWorkflow(team.id, template.id);
  const references = (await tools.find((tool) => tool.name === 'wework_list_workflow_references').execute('refs', { workTypeId: 'data' })).details;
  assert.deepEqual(references.map((item) => item.id), [template.id]);
  const created = (await tools.find((tool) => tool.name === 'wework_create_workflow').execute('create', { name: '本周数据清洗', workTypeId: 'data', sourceWorkflowId: template.id })).details;
  assert.equal(created.temporary, true);
  assert.equal(created.sourceWorkflowId, template.id);
  assert.equal(created.contextTagId, 'work-type:data');
});

test('DAG tool preserves work metadata and selective downstream inputs without embedding skills on nodes', async (t) => {
  const { wework, team, employeeId, spec } = await setup(t);
  await wework.api.configureWorkType(team.id, { id: 'data', name: '数据工作', leadEmployeeId: employeeId, participantEmployeeIds: [employeeId], assignmentPolicy: 'balanced' });
  const workflow = await wework.api.createWorkflow(team.id, { name: 'Typed DAG', temporary: true, workTypeId: 'data' });
  const save = createWeWorkTools(wework, spec).find((tool) => tool.name === 'wework_save_dag');
  const result = (await save.execute('selective', { expectedVersion: workflow.version, name: workflow.name, nodes: [
    { id: 'source', roleName: 'Researcher', label: 'Source' },
    { id: 'use', roleName: 'Analyst', label: 'Use', requires: ['source'], inputBindings: [{ sourceNodeId: 'source', documentTitles: ['数据表'], includeSummary: false }] },
  ] })).details;
  assert.equal(result.workTypeId, 'data');
  assert.equal(result.contextTagId, 'work-type:data');
  assert.deepEqual(result.nodes[1].inputBindings, [{ sourceNodeId: 'source', documentTitles: ['数据表'], includeSummary: false }]);
});

test('downstream work sends revision feedback to its direct upstream owner without an approval gate', async (t) => {
  const { wework, team, employeeId, spec: leadSpec } = await setup(t);
  const upstream = await wework.api.addEmployee(team.id, { displayName: 'Upstream', roleName: 'Analyst', runtime: 'Workspace', skills: [] });
  const downstream = await wework.api.addEmployee(team.id, { displayName: 'Downstream', roleName: 'Reviewer', runtime: 'Workspace', skills: [] });
  for (const member of [upstream, downstream]) await wework.api.updateEmployee(member.id, { displayName: member.displayName, roleName: member.roleName, runtime: 'Workspace', skills: [], defaultRuntimeProfileId: leadSpec.runtimeProfile.id });
  await wework.api.saveWorkflow(team.id, { id: 'feedback-flow', name: 'Feedback flow', description: '', leadEmployeeId: employeeId, participantEmployeeIds: [upstream.id, downstream.id], nodes: [
    { id: 'source', roleName: 'Analyst', label: '准备数据', assignedEmployeeId: upstream.id, requires: [], stepNumber: 1, status: 'ready' },
    { id: 'use', roleName: 'Reviewer', label: '使用数据', assignedEmployeeId: downstream.id, requires: ['source'], stepNumber: 2, status: 'waiting' },
  ] });
  const started = await wework.api.startWorkflow(team.id);
  const sourceWorkId = started.nodes.find((node) => node.id === 'source').workItemId;
  const sourceDocument = await wework.api.saveWorkDocument(sourceWorkId, { title: '结果', kind: 'output', content: 'first attempt' });
  await wework.api.submitDeliverable(sourceWorkId, { summary: 'submitted once', documentIds: [sourceDocument.id], evidence: 'checked' }, { employeeId: upstream.id, runId: 'source-run' });
  await wework.api.completeCurrent(upstream.id);
  const snapshot = await wework.api.snapshot();
  const downstreamWork = snapshot.teams[0].employees.find((item) => item.id === downstream.id).currentWorkItem;
  const spec = await wework.prepare({ id: 'downstream-run', employeeId: downstream.id, workId: downstreamWork.id });
  const feedback = createWeWorkTools(wework, spec).find((tool) => tool.name === 'wework_send_upstream_feedback');
  await feedback.execute('feedback', { sourceNodeId: 'source', feedback: '缺少字段说明，请补充。' });
  const after = await wework.api.snapshot();
  const message = after.teams[0].teamMessages.at(-1);
  assert.equal(message.recipientId, upstream.id);
  assert.match(message.text, /缺少字段说明/);
  assert.equal(after.teams[0].workflow.nodes.find((node) => node.id === 'use').status, 'running');
});
