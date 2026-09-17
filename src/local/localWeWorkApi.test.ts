import { employeeErrorKey, employeeRingState } from '../domain/employeeWorkStatus';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from './localWeWorkApi';
import type { WeWorkTeam, RuntimeProfile } from '../domain/wework';

const profileInput: Omit<RuntimeProfile, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Local Pi',
  adapter: 'pi',
  model: { provider: 'local-vllm', modelId: 'Qwen3', api: 'openai-completions', baseUrl: 'http://127.0.0.1:8000/v1', apiKeyEnv: 'LOCAL_MODEL_API_KEY' },
  systemPrompt: 'You are a local employee.',
  thinkingLevel: 'medium',
  enabled: true,
};

const seed: WeWorkTeam[] = [{
  id: 'team-1', name: 'Local Team', description: '', topology: 'roundTable',
  employees: [{
    id: 'employee-1', displayName: 'Worker', roleName: 'Engineer', color: '#000', status: 'idle',
    runtime: 'Pi', builtInSkills: [],
    activeSession: { id: 'session-1', contextRatio: 0, updatedAt: 'now', messages: [], metrics: [] },
    artifacts: [], queuedWorkItems: [], completedWorkItems: [],
  }],
  pendingWorks: [],
}];

describe('local WeWork service', () => {
  let storage: MemoryWeWorkStorage;

  beforeEach(() => { storage = new MemoryWeWorkStorage(); });

  it('renames a team and persists the normalized name', async () => {
    const api = createLocalWeWorkApi(storage);
    const team = await api.createTeam({ name: 'Before' });
    await api.renameTeam(team.id, '  After  ');
    expect((await api.snapshot()).teams.find((item) => item.id === team.id)?.name).toBe('After');
    await expect(api.renameTeam(team.id, '   ')).rejects.toThrow('团队名称');
  });

  it('embeds the workflow lead skill on new and transferred team leads', async () => {
    const api = createLocalWeWorkApi(storage);
    const team = await api.createTeam({ name: 'Skill team', runtime: 'Workspace' });
    expect(team.employees[0].builtInSkills).toContainEqual({ id: 'wework-workflow-lead', name: 'WeWork 工作流负责人' });
    await api.updateEmployee(team.employees[0].id, { displayName: team.employees[0].displayName, roleName: team.employees[0].roleName, runtime: 'Workspace', skills: [] });
    expect((await api.snapshot()).teams[0].employees[0].builtInSkills).toEqual([]);
    const member = await api.addEmployee(team.id, { displayName: 'Next lead', roleName: 'Lead', runtime: 'Workspace' });
    await api.setLead(team.id, member.id);
    const updated = (await api.snapshot()).teams[0].employees.find((employee) => employee.id === member.id)!;
    expect(updated.builtInSkills).toContainEqual({ id: 'wework-workflow-lead', name: 'WeWork 工作流负责人' });
  });

  it('persists bootstrap and runtime profiles without a server', async () => {
    const first = createLocalWeWorkApi(storage);
    await first.bootstrap(seed);
    const profile = await first.createRuntimeProfile(profileInput);

    const afterRestart = createLocalWeWorkApi(storage);
    expect((await afterRestart.snapshot()).teams[0].name).toBe('Local Team');
    expect((await afterRestart.listRuntimeProfiles()).profiles[0].id).toBe(profile.id);
  });

  it('binds the selected Harness model to the first employee when a team is created', async () => {
    const api = createLocalWeWorkApi(storage);
    const execution = {
      id: 'team-lead-execution', name: 'Pi Session', adapter: 'pi' as const,
      modelCatalogId: 'pi-model-1', model: { provider: 'pi', modelId: 'default' },
      systemPrompt: '', thinkingLevel: 'off' as const, enabled: true, profileRevision: 1,
    };
    const team = await api.createTeam({ name: 'New Team', runtime: 'Pi', sessionExecution: execution });
    expect(team.employees[0].activeSession.execution).toEqual(execution);
  });

  it('creates a project-bound team with the selected workspace in one mutation', async () => {
    const api = createLocalWeWorkApi(storage);
    const team = await api.createTeam({ name: 'Vision', workspaceAssignment: { kind: 'local', rootPath: '/work/vision' } });
    expect(team.workspaceAssignment).toEqual({ kind: 'local', rootPath: '/work/vision' });
    expect((await api.snapshot()).teams[0].workspaceAssignment).toEqual({ kind: 'local', rootPath: '/work/vision' });
  });

  it('creates an empty team when leader initialization is disabled', async () => {
    const team = await createLocalWeWorkApi(storage).createTeam({ name: 'Empty Team', initializeLead: false });
    expect(team.employees).toEqual([]);
  });

  it('archives and restores a team without losing its history', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);

    const archived = await api.archiveTeam('team-1');
    expect(archived.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await api.snapshot()).teams).toHaveLength(0);
    expect((await api.snapshot({ includeArchived: true })).teams[0]).toMatchObject({ id: 'team-1', name: 'Local Team' });

    await api.restoreTeam('team-1');
    expect((await api.snapshot()).teams[0]).toMatchObject({ id: 'team-1', name: 'Local Team' });
    expect((await api.snapshot()).teams[0].archivedAt).toBeUndefined();
  });

  it('requires archival before permanent team deletion and retains the Workspace by default', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);

    await expect(api.deleteTeam('team-1')).rejects.toThrow(/archive/i);
    await api.archiveTeam('team-1');
    await expect(api.deleteTeam('team-1')).resolves.toEqual({ deleted: 'team-1', workspaceRetained: true });
    expect((await api.snapshot({ includeArchived: true })).teams).toHaveLength(0);
  });

  it('rejects raw model secrets before local runtime profiles are persisted', async () => {
    const api = createLocalWeWorkApi(storage);
    await expect(api.createRuntimeProfile({ ...profileInput, model: { ...profileInput.model, apiKey: 'sk-live-secret' } as any })).rejects.toThrow(/runtime profile/i);
    expect(storage.getItem('wework.local.v1')).toBeNull();
  });

  it('rejects raw model secrets from imported profiles, Session executions, and persisted state', async () => {
    const invalidProfile = { ...profileInput, id: 'unsafe-profile', createdAt: 'before', updatedAt: 'before', model: { ...profileInput.model, apiKey: 'sk-live-secret' } };
    await expect(createLocalWeWorkApi(storage).importLocalState({ teams: seed, runtimeProfiles: [invalidProfile as RuntimeProfile], eventCursor: 0 })).rejects.toThrow(/runtime profile/i);
    expect(storage.getItem('wework.local.v1')).toBeNull();

    const invalidExecution = { ...profileInput, id: 'unsafe-execution', profileRevision: 1, model: { ...profileInput.model, privateKey: 'BEGIN PRIVATE KEY' } };
    await expect(createLocalWeWorkApi(storage).bootstrap([{ ...seed[0], employees: [{ ...seed[0].employees[0], activeSession: { ...seed[0].employees[0].activeSession, execution: invalidExecution } }]}] as WeWorkTeam[])).rejects.toThrow(/session execution/i);
    expect(storage.getItem('wework.local.v1')).toBeNull();

    storage.setItem('wework.local.v1', JSON.stringify({ teams: seed, runtimeProfiles: [invalidProfile], eventCursor: 1 }));
    await expect(createLocalWeWorkApi(storage).snapshot()).rejects.toThrow(/runtime profile/i);
  });

  it('rejects raw model secrets in employee Session mutations without changing saved state', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const unsafe = { ...profileInput, id: 'unsafe-execution', profileRevision: 1, model: { ...profileInput.model, token: 'raw-token' } };
    await expect(api.addEmployee('team-1', { displayName: 'Unsafe', roleName: 'Engineer', runtime: 'Pi', sessionExecution: unsafe as any })).rejects.toThrow(/session execution/i);
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: unsafe as any })).rejects.toThrow(/session execution/i);
    expect(storage.getItem('wework.local.v1')).not.toContain('raw-token');
  });

  it('keeps an unconfigured workspace employee unconfigured despite a team default', async () => {
    const profile: RuntimeProfile = { ...profileInput, id: 'team-default', createdAt: 'before', updatedAt: 'before' };
    storage.setItem('wework.local.v1', JSON.stringify({
      teams: [{ ...seed[0], defaultRuntimeProfileId: profile.id }], runtimeProfiles: [profile], eventCursor: 0,
    }));
    const api = createLocalWeWorkApi(storage);
    const employee = await api.addEmployee('team-1', { displayName: 'New', roleName: '', runtime: 'Workspace' });
    const restored = (await createLocalWeWorkApi(storage).snapshot()).teams[0].employees.find(item => item.id === employee.id);
    expect(restored?.activeSession.execution).toBeUndefined();
  });

  it('migrates a legacy employee profile into an owned session execution config', async () => {
    const profile: RuntimeProfile = { ...profileInput, id: 'legacy-profile', createdAt: 'before', updatedAt: 'before' };
    storage.setItem('wework.local.v1', JSON.stringify({
      teams: [{ ...seed[0], defaultRuntimeProfileId: profile.id, employees: [{ ...seed[0].employees[0], defaultRuntimeProfileId: profile.id }] }],
      runtimeProfiles: [profile], eventCursor: 3,
    }));
    const api = createLocalWeWorkApi(storage);
    const execution = (await api.snapshot()).teams[0].employees[0].activeSession.execution;
    expect(execution?.model.modelId).toBe('Qwen3');
    expect(execution?.sourceProfileId).toBe(profile.id);
    expect(execution?.profileRevision).toBe(1);
    expect(JSON.parse(storage.getItem('wework.local.v1')!).teams[0].employees[0].activeSession.execution).toBeTruthy();
  });

  it('exposes honest workspace transport boundaries in browser-local mode', async () => {
    const api = createLocalWeWorkApi(storage);
    await expect(api.uploadWorkspaceArtifact({ teamId: 't', workspaceId: 'w', fileName: 'x', bytes: new Uint8Array() })).rejects.toMatchObject({ code: 'WORKSPACE_HOST_REQUIRED' });
    await expect(api.syncWorkspace({ teamId: 't', workspaceId: 'w', direction: 'pull' })).rejects.toMatchObject({ code: 'WORKSPACE_SYNC_UNAVAILABLE' });
  });

  it('persists a team Workspace independently from employee overrides', async () => {
    const api = createLocalWeWorkApi(storage); await api.bootstrap(seed);
    await api.updateTeamWorkspace('team-1', { kind: 'local', rootPath: '/teams/shared' });
    await api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], workspaceAssignment: { kind: 'local', rootPath: '/employees/private' } });
    const team = (await api.snapshot()).teams[0];
    expect(team.workspaceAssignment).toEqual({ kind: 'local', rootPath: '/teams/shared' });
    expect(team.employees[0].workspaceAssignment).toEqual({ kind: 'local', rootPath: '/employees/private' });
    await api.updateTeamWorkspace('team-1', undefined);
    expect((await api.snapshot()).teams[0].workspaceAssignment).toBeUndefined();
  });

  it('rejects malformed team Workspace assignments without changing the saved team', async () => {
    const api = createLocalWeWorkApi(storage); await api.bootstrap(seed);
    const invalidAssignments = [
      { kind: 'local', rootPath: 'relative/team' },
      { kind: 'ssh', host: '', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh' },
      { kind: 'ssh', host: 'gpu.example.com', port: 70000, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh' },
    ];
    for (const assignment of invalidAssignments) {
      await expect(api.updateTeamWorkspace('team-1', assignment as any)).rejects.toMatchObject({ code: 'WORKSPACE_ASSIGNMENT_INVALID' });
    }
    expect((await api.snapshot()).teams[0].workspaceAssignment).toBeUndefined();
  });

  it.each(['bootstrap', 'importLocalState'] as const)('rejects invalid IDs and secret-bearing Workspace assignments transactionally during %s', async (method) => {
    const api = createLocalWeWorkApi(storage);
    const invalid = [{ ...seed[0], id: '../escape', workspaceAssignment: { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh-team', password: 'raw-secret' } as any }];
    const operation = method === 'bootstrap'
      ? api.bootstrap(invalid)
      : api.importLocalState({ teams: invalid, runtimeProfiles: [], eventCursor: 0 });
    await expect(operation).rejects.toThrow();
    expect(storage.getItem('wework.local.v1')).toBeNull();
  });

  for (const method of ['bootstrap', 'importLocalState'] as const) for (const [label, teamId, employeeId] of [
    ['missing team ID', undefined, 'employee-safe'], ['numeric team ID', 7, 'employee-safe'], ['boolean team ID', true, 'employee-safe'],
    ['missing employee ID', 'team-safe', undefined], ['numeric employee ID', 'team-safe', 7], ['boolean employee ID', 'team-safe', false],
  ] as const) it(`rejects ${label} transactionally during ${method}`, async () => {
    const api = createLocalWeWorkApi(storage);
    const teams = [{ ...seed[0], id: teamId, employees: [{ ...seed[0].employees[0], id: employeeId }] }] as unknown as WeWorkTeam[];
    const operation = method === 'bootstrap' ? api.bootstrap(teams) : api.importLocalState({ teams, runtimeProfiles: [], eventCursor: 0 });
    await expect(operation).rejects.toThrow(/immutable .* id/i);
    expect(storage.getItem('wework.local.v1')).toBeNull();
  });

  it('rejects invalid persisted Workspace metadata before returning a snapshot', async () => {
    storage.setItem('wework.local.v1', JSON.stringify({ teams: [{ ...seed[0], workspaceAssignment: { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh-team', privateKey: 'raw-secret' } }], runtimeProfiles: [], eventCursor: 1 }));
    await expect(createLocalWeWorkApi(storage).snapshot()).rejects.toThrow();
  });

  for (const [label, teamId, employeeId] of [
    ['missing team ID', undefined, 'employee-safe'], ['numeric team ID', 7, 'employee-safe'], ['boolean team ID', true, 'employee-safe'],
    ['missing employee ID', 'team-safe', undefined], ['numeric employee ID', 'team-safe', 7], ['boolean employee ID', 'team-safe', false],
  ] as const) it(`rejects persisted state with ${label} before returning a snapshot`, async () => {
    const teams = [{ ...seed[0], id: teamId, employees: [{ ...seed[0].employees[0], id: employeeId }] }];
    storage.setItem('wework.local.v1', JSON.stringify({ teams, runtimeProfiles: [], eventCursor: 1 }));
    await expect(createLocalWeWorkApi(storage).snapshot()).rejects.toThrow(/immutable .* id/i);
  });

  it('reads previously accepted hierarchical credential references without exposing secret material', async () => {
    const legacy = structuredClone(seed);
    legacy[0].workspaceAssignment = { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work/cv', credentialRef: 'vault:ssh/team' };
    storage.setItem('wework.local.v1', JSON.stringify({ teams: legacy, runtimeProfiles: [], eventCursor: 1 }));
    expect((await createLocalWeWorkApi(storage).snapshot()).teams[0].workspaceAssignment).toEqual(legacy[0].workspaceAssignment);
    expect(storage.getItem('wework.local.v1')).not.toContain('password');
  });

  it('saves employee-owned execution config and rejects stale or conflicting renderer writes', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const execution = { ...profileInput, id: 'employee-config', profileRevision: 2 };
    await api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: execution });
    expect((await api.snapshot()).teams[0].employees[0].activeSession.execution?.model.modelId).toBe('Qwen3');
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: { ...execution, profileRevision: 1 } })).rejects.toMatchObject({ code: 'SESSION_EXECUTION_STALE' });
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: { ...execution, model: { ...execution.model, modelId: 'stale-edit' } } })).rejects.toMatchObject({ code: 'SESSION_EXECUTION_CONFLICT' });
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: execution })).resolves.toBeTruthy();
  });

  it('creates an employee with the selected Harness model bound to its Session', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const execution = { ...profileInput, id: 'new-employee-pi', adapter: 'pi' as const, sourceProfileId: 'pi:model:default', profileRevision: 1 };
    const employee = await api.addEmployee('team-1', { displayName: 'Pi Worker', roleName: 'Research', runtime: 'Pi', sessionExecution: execution });
    expect(employee.activeSession.execution).toEqual(execution);
  });

  it('allows model changes but locks the Harness once a Session has context', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const current = { ...profileInput, id: 'employee-config', adapter: 'pi' as const, profileRevision: 2 };
    await api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: current });
    await api.sendMessage('employee-1', 'keep this native session');
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: { ...current, model: { provider: 'openai', modelId: 'gpt-5' }, profileRevision: 3 } })).resolves.toBeTruthy();
    await expect(api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'DSH', skills: [], sessionExecution: { ...current, adapter: 'smalldash', profileRevision: 4 } })).rejects.toMatchObject({ code: 'SESSION_HARNESS_IMMUTABLE' });
  });

  it('lets an existing employee change Harness by starting a clean Session atomically', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const current = { ...profileInput, id: 'pi-session', adapter: 'pi' as const, profileRevision: 1 };
    await api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], sessionExecution: current });
    await api.sendMessage('employee-1', 'old Pi context');
    const previousSessionId = (await api.snapshot()).teams[0].employees[0].activeSession.id;
    const replacement = { ...current, id: 'sdh-session', adapter: 'smalldash' as const, profileRevision: 2 };
    await api.updateEmployee('employee-1', { displayName: 'Worker', roleName: 'Engineer', runtime: 'DSH', skills: [], sessionExecution: replacement, startNewSession: true });
    const employee = (await api.snapshot()).teams[0].employees[0];
    expect(employee.activeSession.id).not.toBe(previousSessionId);
    expect(employee.activeSession.messages).toEqual([]);
    expect(employee.activeSession.execution).toEqual(replacement);
  });

  it('runs one assigned work item and queues later work locally', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const profile = await api.createRuntimeProfile(profileInput);
    await api.updateEmployee('employee-1', {
      displayName: 'Worker', roleName: 'Engineer', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id,
    });
    const first = await api.createWork('team-1', { title: 'First', goal: 'one', priority: 'high', category: 'Digital' });
    const second = await api.createWork('team-1', { title: 'Second', goal: 'two', priority: 'medium', category: 'Digital' });

    await api.assignWork(first.id, 'employee-1');
    await api.assignWork(second.id, 'employee-1');
    let employee = (await api.snapshot()).teams[0].employees[0];
    expect(employee.currentWorkItem?.id).toBe(first.id);
    expect(employee.queuedWorkItems?.map((work) => work.id)).toEqual([second.id]);

    await expect(api.completeCurrent('employee-1')).rejects.toThrow('accepted deliverable');
    const output = await api.saveWorkDocument(first.id, { title: 'Result', content: 'verified output', kind: 'output' });
    const deliverable = await api.submitDeliverable(first.id, { summary: 'done', documentIds: [output.id], evidence: 'verified' });
    await api.reviewDeliverable(first.id, { deliverableId: deliverable.id, decision: 'accepted', feedback: 'reviewed' });
    await api.completeCurrent('employee-1');
    employee = (await api.snapshot()).teams[0].employees[0];
    expect(employee.currentWorkItem?.id).toBe(second.id);
    expect(employee.completedWorkItems?.map((work) => work.id)).toEqual([first.id]);
  });

  it('executes a DAG by passing accepted upstream outputs into downstream work', async () => {
    const api = createLocalWeWorkApi(storage);
    const workflowTeam: WeWorkTeam = {
      ...seed[0], topology: 'workflowDag',
      employees: [
        { ...seed[0].employees[0], runtime: 'Workspace', id: 'employee-upstream' },
        { ...seed[0].employees[0], runtime: 'Workspace', id: 'employee-downstream', activeSession: { ...seed[0].employees[0].activeSession, id: 'session-2' } },
      ],
      workflow: {
        id: 'workflow-1', name: 'Pipeline', description: '', nodes: [
          { id: 'collect', label: 'Collect', roleName: 'Researcher', stepNumber: 1, status: 'ready', assignedEmployeeId: 'employee-upstream', requires: [], goal: 'Collect source material' },
          { id: 'write', label: 'Write', roleName: 'Writer', stepNumber: 2, status: 'waiting', assignedEmployeeId: 'employee-downstream', requires: ['collect'], goal: 'Write from the source material', inputBindings: [{ sourceNodeId: 'collect', documentTitles: ['Research'], includeSummary: true }], requiredSkillIds: ['fact-check'] },
        ],
      },
    };
    await api.bootstrap([workflowTeam]);

    const started = await api.startWorkflow('team-1');
    expect(started.nodes.map((node) => node.status)).toEqual(['running', 'waiting']);
    let team = (await api.snapshot()).teams[0];
    const upstreamWork = team.employees[0].currentWorkItem!;
    const downstreamWork = team.pendingWorks.find((work) => work.workflowNodeId === 'write')!;
    expect(downstreamWork.status).toBe('blocked');
    expect(downstreamWork.records?.documents).toEqual([]);

    const output = await api.saveWorkDocument(upstreamWork.id, { title: 'Research', content: 'accepted facts', kind: 'output' });
    const irrelevant = await api.saveWorkDocument(upstreamWork.id, { title: 'Scratchpad', content: 'do not forward', kind: 'output' });
    await api.submitDeliverable(upstreamWork.id, { summary: 'facts ready', documentIds: [output.id, irrelevant.id], evidence: 'checked' });
    await api.completeCurrent('employee-upstream');

    team = (await api.snapshot()).teams[0];
    expect(team.workflow?.nodes.map((node) => node.status)).toEqual(['completed', 'running']);
    const running = team.employees[1].currentWorkItem!;
    expect(running.workflowNodeId).toBe('write');
    expect(running.records?.documents).toEqual([
      expect.objectContaining({ kind: 'input', title: 'Collect / Research', content: 'accepted facts', sourceWorkId: upstreamWork.id, sourceDocumentId: output.id, sourceNodeId: 'collect' }),
      expect.objectContaining({ kind: 'input', title: 'Collect / 交付摘要', content: 'facts ready', sourceWorkId: upstreamWork.id, sourceNodeId: 'collect' }),
    ]);
  });

  it('waits for every dependency and does not duplicate propagated DAG inputs', async () => {
    const api = createLocalWeWorkApi(storage);
    const worker = (id: string, sessionId: string) => ({ ...seed[0].employees[0], id, runtime: 'Workspace' as const, activeSession: { ...seed[0].employees[0].activeSession, id: sessionId } });
    await api.bootstrap([{
      ...seed[0], topology: 'workflowDag', employees: [worker('a', 'sa'), worker('b', 'sb'), worker('c', 'sc')],
      workflow: { id: 'wf', name: 'Merge', description: '', nodes: [
        { id: 'a', label: 'A', roleName: 'A', stepNumber: 1, status: 'ready', assignedEmployeeId: 'a', requires: [] },
        { id: 'b', label: 'B', roleName: 'B', stepNumber: 2, status: 'ready', assignedEmployeeId: 'b', requires: [] },
        { id: 'c', label: 'C', roleName: 'C', stepNumber: 3, status: 'waiting', assignedEmployeeId: 'c', requires: ['a', 'b'] },
      ] },
    }]);
    await api.startWorkflow('team-1');
    for (const employeeId of ['a', 'b']) {
      const current = (await api.snapshot()).teams[0].employees.find((employee) => employee.id === employeeId)!.currentWorkItem!;
      const output = await api.saveWorkDocument(current.id, { title: `${employeeId} output`, content: employeeId, kind: 'output' });
      const delivery = await api.submitDeliverable(current.id, { summary: 'done', documentIds: [output.id], evidence: 'checked' });
      await api.reviewDeliverable(current.id, { deliverableId: delivery.id, decision: 'accepted', feedback: 'approved' });
      await api.completeCurrent(employeeId);
      const team = (await api.snapshot()).teams[0];
      if (employeeId === 'a') expect(team.pendingWorks.find((work) => work.workflowNodeId === 'c')?.status).toBe('blocked');
    }
    const downstream = (await api.snapshot()).teams[0].employees.find((employee) => employee.id === 'c')!.currentWorkItem!;
    expect(downstream.records?.documents).toHaveLength(2);
  });

  it('persists accepted node outputs in the native workflow data store when configured', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap([{
      ...seed[0], topology: 'workflowDag', employees: [{ ...seed[0].employees[0], runtime: 'Workspace' }],
      workflow: { id: 'wf-data', name: 'Research', description: '', nodes: [
        { id: 'facts', label: 'Facts', roleName: 'Researcher', stepNumber: 1, status: 'ready', assignedEmployeeId: 'employee-1', requires: [], outputPersistence: 'database' },
      ] },
    }]);
    await api.startWorkflow('team-1');
    const work = (await api.snapshot()).teams[0].employees[0].currentWorkItem!;
    const output = await api.saveWorkDocument(work.id, { title: 'Facts JSON', content: '{"fact":"verified"}', kind: 'output' });
    await api.submitDeliverable(work.id, { summary: 'done', documentIds: [output.id], evidence: 'checked' });
    await api.completeCurrent('employee-1');
    expect((await api.snapshot()).teams[0].workflowDataRecords).toEqual([
      expect.objectContaining({ workflowId: 'wf-data', nodeId: 'facts', workId: work.id, sourceDocumentId: output.id, title: 'Facts JSON', content: '{"fact":"verified"}' }),
    ]);
  });

  it('keeps multiple independent workflow graphs for one team and selects between them', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    const first = await api.createWorkflow('team-1', { name: '客户交付', temporary: false, workType: 'CV交付', leadEmployeeId: 'employee-1', participantEmployeeIds: ['employee-1'] });
    const second = await api.createWorkflow('team-1', { name: '临时排查', temporary: true, workType: '故障排查', leadEmployeeId: 'employee-1', participantEmployeeIds: ['employee-1'] });
    let team = (await api.snapshot()).teams[0];
    expect(team.workflows?.map((workflow) => workflow.name)).toEqual(['客户交付', '临时排查']);
    expect(team.activeWorkflowId).toBe(second.id);
    expect(team.workflow?.id).toBe(second.id);
    await api.selectWorkflow('team-1', first.id);
    team = (await api.snapshot()).teams[0];
    expect(team.activeWorkflowId).toBe(first.id);
    expect(team.workflow?.id).toBe(first.id);
    expect(team.workflows?.find((workflow) => workflow.id === second.id)?.temporary).toBe(true);
    expect((await api.listWorkflowReferences('team-1', 'CV交付')).map((workflow) => workflow.id)).toEqual([first.id]);
  });

  it('allows a concrete task to link to zero or one DAG', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    await api.configureWorkType('team-1', { id: 'data', name: '数据工作', leadEmployeeId: 'employee-1', participantEmployeeIds: ['employee-1'], assignmentPolicy: 'manual' });
    const work = await api.createWork('team-1', { title: '清洗本周数据', goal: '输出可用数据', priority: 'medium', category: 'Digital' });
    expect(work.dagWorkflowId).toBeUndefined();
    const workflow = await api.createWorkflow('team-1', { name: work.title, temporary: true, workTypeId: 'data', workId: work.id });
    const linked = (await api.snapshot()).teams[0].pendingWorks.find((candidate) => candidate.id === work.id)!;
    expect(linked.dagWorkflowId).toBe(workflow.id);
    expect(workflow.workId).toBe(work.id);
    await expect(api.createWorkflow('team-1', { name: '重复 DAG', temporary: true, workTypeId: 'data', workId: work.id })).rejects.toThrow('already has a DAG');
  });

  it('uses a team-lead-maintained work type pool for balanced DAG assignment', async () => {
    const api = createLocalWeWorkApi(storage);
    const busy = { ...seed[0].employees[0], id: 'busy', runtime: 'Workspace' as const, currentWorkItem: { id: 'existing', title: 'Existing', goal: 'busy', status: 'running' as const, assignedEmployeeId: 'busy', priority: 'medium' as const, category: 'Digital' as const, createdAt: 'now' } };
    const idle = { ...seed[0].employees[0], id: 'idle', runtime: 'Workspace' as const, activeSession: { ...seed[0].employees[0].activeSession, id: 'idle-session' } };
    await api.bootstrap([{ ...seed[0], employees: [busy, idle] }]);
    await api.configureWorkType('team-1', { id: 'data', name: '数据工作', leadEmployeeId: 'busy', participantEmployeeIds: ['busy', 'idle'], assignmentPolicy: 'balanced', assignmentWeights: { busy: 1, idle: 1 } });
    const workflow = await api.createWorkflow('team-1', { name: '数据清洗', temporary: true, workTypeId: 'data', leadEmployeeId: 'busy', participantEmployeeIds: ['busy', 'idle'] });
    await api.saveWorkflow('team-1', { ...workflow, nodes: [{ id: 'clean', label: '清洗', roleName: '数据', stepNumber: 1, status: 'ready', requires: [] }] });
    await api.startWorkflow('team-1');
    const team = (await api.snapshot()).teams[0];
    expect(team.workTypes?.[0]).toMatchObject({ id: 'data', name: '数据工作', contextTagId: 'work-type:data' });
    expect(team.workflow?.nodes[0].assignedEmployeeId).toBe('idle');
    expect(team.employees.find((employee) => employee.id === 'idle')?.currentWorkItem?.workflowNodeId).toBe('clean');
  });

  it('persists employee workspace assignments without storing SSH secret material', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    await api.updateEmployee('employee-1', {
      displayName: 'Employee 1', roleName: 'Lead', runtime: 'Pi', skills: [],
      workspaceAssignment: { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work/cv', credentialRef: 'keychain:ssh/gpu' },
    });
    const employee = (await api.snapshot()).teams[0].employees[0];
    expect(employee.workspaceAssignment).toEqual({ kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work/cv', credentialRef: 'keychain:ssh/gpu' });
    expect(JSON.stringify(employee)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(employee)).not.toContain('password');
  });

  it('resets the employee session checkpoint locally', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    await api.sendMessage('employee-1', 'remember me');
    const previous = (await api.snapshot()).teams[0].employees[0].activeSession.id;
    await api.resetEmployeeContext('employee-1');
    const session = (await api.snapshot()).teams[0].employees[0].activeSession;
    expect(session.id).not.toBe(previous);
    expect(session.messages).toEqual([]);
  });

  it('persists team chat messages across local service restarts', async () => {
    const api = createLocalWeWorkApi(storage);
    await api.bootstrap(seed);
    await api.sendTeamMessage('team-1', 'persistent team update');

    const restarted = createLocalWeWorkApi(storage);
    expect((await restarted.snapshot()).teams[0].teamMessages?.map((message) => message.text)).toEqual(['persistent team update']);
  });
});

it('persists exactly the observed error acknowledgement without hiding a newer failure', async () => {
 const storage = new MemoryWeWorkStorage(); const api = createLocalWeWorkApi(storage); await api.bootstrap(seed);
 await api.setEmployeeActivity('employee-1','error','first');
 const old = (await api.snapshot()).teams[0].employees[0]; const key = employeeErrorKey(old)!;
 await api.acknowledgeEmployeeError(old.id,key);
 expect(employeeRingState((await createLocalWeWorkApi(storage).snapshot()).teams[0].employees[0])).toBe('idle');
 await api.setEmployeeActivity(old.id,'error','second'); await api.acknowledgeEmployeeError(old.id,key);
 expect(employeeRingState((await api.snapshot()).teams[0].employees[0])).toBe('error');
});

it('returning the last task clears stale waiting activity', async () => {
 const storage = new MemoryWeWorkStorage(); const api = createLocalWeWorkApi(storage);
 const teams = structuredClone(seed);
 teams[0].employees[0].currentWorkItem = {id:'work-state',title:'Review',goal:'',priority:'medium',category:'Digital',status:'running',createdAt:'now'} as NonNullable<typeof teams[0]['employees'][0]['currentWorkItem']>;
 teams[0].employees[0].executionActivity = {state:'waiting',detail:'等待交付审核',updatedAt:'now'};
 await api.bootstrap(teams); await api.returnCurrent('employee-1');
 const team = (await api.snapshot()).teams[0];
 expect(employeeRingState(team.employees[0])).toBe('idle');
 expect(team.pendingWorks.map(work=>work.id)).toContain('work-state');
});

it('persists ordered run output and activity without duplicates across reloads', async () => {
  const storage = new MemoryWeWorkStorage(); const api = createLocalWeWorkApi(storage);
  await api.bootstrap(seed);
  const events = [
    { sequence: 1, type: 'assistant.delta', text: 'Preparing' },
    { sequence: 2, type: 'assistant.activity', activity: 'tool', text: 'Read file' },
    { sequence: 3, type: 'assistant.delta', text: 'Result' },
  ];
  await api.appendRuntimeEvents('employee-1', 'session-1', 'run-1', events);
  await api.appendRuntimeEvents('employee-1', 'session-1', 'run-1', events);
  const reloaded = createLocalWeWorkApi(storage);
  expect((await reloaded.snapshot()).teams[0].employees[0].activeSession.messages.map(message => message.text)).toEqual(['Preparing', '工具 · Read file', 'Result']);
  await api.appendRuntimeEvents('employee-1', 'old-session', 'old-run', events);
  expect((await reloaded.snapshot()).teams[0].employees[0].activeSession.messages).toHaveLength(3);
});

it('keeps private and work conversations separate across output, stop and private reset', async () => {
  const api = createLocalWeWorkApi(new MemoryWeWorkStorage()); await api.bootstrap(seed);
  const profile = await api.createRuntimeProfile(profileInput);
  await api.updateEmployee('employee-1',{displayName:'Worker',roleName:'Engineer',runtime:'Pi',skills:[],defaultRuntimeProfileId:profile.id});
  const work = await api.createWork('team-1', {title:'Analysis',goal:'Analyze',priority:'medium',category:'Digital'});
  await api.assignWork(work.id,'employee-1');
  const session = await api.ensureWorkSession('employee-1',work.id);
  await api.sendMessage('employee-1','private');
  await api.sendMessage('employee-1','work note',work.id);
  await api.appendRuntimeEvents('employee-1',session.id,'work-run',[{sequence:1,type:'assistant.delta',text:'work output'}]);
  const employee=(await api.snapshot()).teams[0].employees[0];
  expect(employee.activeSession.messages.map(m=>m.text)).toEqual(['private']);
  expect(employee.workSessions?.[work.id].messages.map(m=>m.text)).toEqual(['work note','work output']);
  await api.resetEmployeeContext('employee-1');
  const restored=(await api.snapshot()).teams[0].employees[0];
  expect(restored.workSessions?.[work.id].id).toBe(session.id);
  expect(restored.workSessions?.[work.id].messages).toHaveLength(2);
  await expect(api.ensureWorkSession('employee-1','unrelated')).rejects.toThrow();
});
