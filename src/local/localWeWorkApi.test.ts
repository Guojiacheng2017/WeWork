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
