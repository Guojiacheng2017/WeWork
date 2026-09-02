import { expect, it } from 'vitest';
import { LocalRunScheduler } from './localRunScheduler';

it('resolves work runtime override and workspace before starting one run', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    wework: {
      snapshot: async () => ({ teams: [{ id: 'team', defaultRuntimeProfileId: 'team-p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', defaultRuntimeProfileId: 'employee-p', workspaceAssignment: { kind: 'local', rootPath: '/repo' }, activeSession: { messages: [] }, currentWorkItem: { id: 'work', title: 'Do', goal: 'Goal', status: 'running', runtimeProfileId: 'work-p' } }] }] }),
      listRuntimeProfiles: async () => ({ profiles: [{ id: 'work-p', adapter: 'pi', enabled: true, model: {} }] }),
    },
    host: { currentWorkspace: async () => ({ kind: 'local', rootPath: '/default' }), startRun: async (spec: object) => { started.push(spec); return { id: 'run', status: 'queued' }; } },
  } as any);
  await scheduler.startCurrentWork('employee');
  expect(started[0].runtimeProfile.id).toBe('work-p');
  expect(started[0].workspace.rootPath).toBe('/repo');
});

it('uses the team Workspace unless the employee overrides it', async () => {
  const started: any[] = [];
  const team = { id: 'team', workspaceAssignment: { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'team', rootPath: '/team', credentialRef: 'vault:team' }, defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', activeSession: { id: 'session', messages: [] }, currentWorkItem: { id: 'work', title: 'Do', goal: 'Goal' } }] };
  const scheduler = new LocalRunScheduler({
    wework: { snapshot: async () => ({ teams: [team] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true }] }) },
    host: { currentWorkspace: async () => ({ kind: 'local', rootPath: '/current' }), startRun: async (spec: object) => { started.push(spec); return { id: `run-${started.length}`, status: 'queued' }; } },
  } as any);

  await scheduler.startCurrentWork('employee');
  expect(started[0].workspace).toEqual(team.workspaceAssignment);
});

it('migrates a rootless legacy local assignment to the canonical employee directory', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    wework: { snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', activeSession: { id: 'session', messages: [] }, currentWorkItem: { id: 'work', title: 'Do', goal: 'Goal' } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true }] }) },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '/current' }), startRun: async (spec: object) => { started.push(spec); return { id: 'run-current', status: 'queued' }; } },
  } as any);

  await scheduler.startCurrentWork('employee');
  expect(started[0].workspace).toEqual({ kind: 'local', rootPath: '/Documents/WeWork/team/employees/employee' });
});

it('resolves an unassigned team to its canonical WeWork directory', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    wework: { snapshot: async () => ({ teams: [{ id: 'team-7', defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', activeSession: { id: 'session', messages: [] }, currentWorkItem: { id: 'work', title: 'Do', goal: 'Goal' } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true }] }) },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '/current' }), startRun: async (spec: object) => { started.push(spec); return { id: 'run-default', status: 'queued' }; } },
  } as any);

  await scheduler.startCurrentWork('employee');
  expect(started[0].workspace).toEqual({ kind: 'local', rootPath: '/Documents/WeWork/team-7/employees/employee' });
});

it('fails closed when the canonical WeWork directory cannot be resolved', async () => {
  let started = false;
  const scheduler = new LocalRunScheduler({
    wework: { snapshot: async () => ({ teams: [{ id: 'team-7', defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', activeSession: { messages: [] }, currentWorkItem: { id: 'work', title: 'Do', goal: 'Goal' } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true }] }) },
    host: { dataInfo: async () => { throw new Error('data info offline'); }, currentWorkspace: async () => ({ kind: 'local', rootPath: '/unrelated-current' }), startRun: async () => { started = true; return { id: 'wrong', status: 'queued' }; } },
  } as any);

  await expect(scheduler.startCurrentWork('employee')).rejects.toThrow('data info offline');
  expect(started).toBe(false);
});

it('rejects a second active run for the same employee', async () => {
  const scheduler = new LocalRunScheduler({ wework: { snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, employees: [{ id: 'employee', defaultRuntimeProfileId: 'p', activeSession: { messages: [] }, currentWorkItem: { id: 'w', title: 'x', goal: 'y' } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', adapter: 'pi', enabled: true, model: {} }] }) }, host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '.' }), startRun: async () => ({ id: 'run', status: 'queued' }) } } as any);
  await scheduler.startCurrentWork('employee');
  await expect(scheduler.startCurrentWork('employee')).rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE' });
});

it('persists the active run and recovers terminal state after app restart', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const ports: any = {
    storage,
    wework: { snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, employees: [{ id: 'employee', defaultRuntimeProfileId: 'p', activeSession: { id: 'session', messages: [] }, currentWorkItem: { id: 'w', title: 'x', goal: 'y' } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true, model: {} }] }) },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '.' }), startRun: async () => ({ id: 'run-restored', status: 'queued' }), run: async () => ({ status: 'succeeded' }) },
  };
  await new LocalRunScheduler(ports).startCurrentWork('employee');
  const restarted = new LocalRunScheduler(ports);
  expect(restarted.employeeForRun('run-restored')).toBe('employee');
  expect(await restarted.recover()).toEqual([{ employeeId: 'employee', runId: 'run-restored', status: 'succeeded' }]);
  expect(restarted.employeeForRun('run-restored')).toBeUndefined();
});

it('starts a workbench prompt as a conversation run without requiring current work', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    wework: {
      snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', activeSession: { id: 'session', messages: [] } }] }] }),
      listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', adapter: 'pi', enabled: true, model: {} }] }),
    },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '/repo' }), startRun: async (spec: object) => { started.push(spec); return { id: 'chat-run', status: 'queued' }; } },
  } as any);
  await scheduler.startPrompt('employee', 'Can you speak?');
  expect(started[0].work.goal).toBe('Can you speak?');
  expect(started[0].team).toEqual({ id: 'team', name: undefined, workspaceAssignment: { kind: 'local' } });
  expect(scheduler.isPromptRun('chat-run')).toBe(true);
});

it('sends remote Desktop runs with authoritative team and employee workspace metadata for Host preparation', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    managedWeWork: false,
    wework: { snapshot: async () => ({ teams: [{ id: 'remote-team', name: 'Remote team', workspaceAssignment: undefined, defaultRuntimeProfileId: 'p', employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', workspaceAssignment: { kind: 'local' }, activeSession: { id: 'session', messages: [] } }] }] }), listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', name: 'Pi', adapter: 'pi', enabled: true, model: { provider: 'pi', modelId: 'default' }, systemPrompt: '', thinkingLevel: 'off' }] }) },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '/selected' }), startRun: async (spec: object) => { started.push(spec); return { id: 'remote-run', status: 'queued' }; } },
  } as any);

  await scheduler.startPrompt('employee', 'Remote prompt');
  expect(started[0].weworkManaged).toBe(false);
  expect(started[0].team).toEqual({ id: 'remote-team', name: 'Remote team', workspaceAssignment: undefined });
  expect(started[0].employee.workspaceAssignment).toEqual({ kind: 'local' });
});

it('starts from the employee Session execution without a legacy Runtime Profile', async () => {
  const started: any[] = [];
  const execution = { id: 'employee-pi', name: 'Pi Session', adapter: 'pi', enabled: true, profileRevision: 1, model: { provider: 'pi', modelId: 'deepseek-v4' } };
  const scheduler = new LocalRunScheduler({
    wework: { snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, employees: [{ id: 'employee', displayName: 'Worker', roleName: 'Engineer', activeSession: { id: 'session', messages: [], execution } }] }] }), listRuntimeProfiles: async () => ({ profiles: [] }) },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '/repo' }), startRun: async (spec: object) => { started.push(spec); return { id: 'session-run', status: 'queued' }; } },
  } as any);
  await scheduler.startPrompt('employee', 'Use the configured Harness');
  expect(started[0].runtimeProfile).toEqual(execution);
});

it('continues the managed task when a workbench follow-up arrives', async () => {
  const started: any[] = [];
  const scheduler = new LocalRunScheduler({
    managedWeWork: true,
    wework: {
      snapshot: async () => ({ teams: [{ id: 'team', workspaceAssignment: { kind: 'local' }, employees: [{ id: 'employee', defaultRuntimeProfileId: 'p', activeSession: { id: 's', messages: [] }, currentWorkItem: { id: 'w', title: 'Analysis', goal: 'Analyze' } }] }] }),
      listRuntimeProfiles: async () => ({ profiles: [{ id: 'p', enabled: true }] }),
    },
    host: { dataInfo: async () => ({ rootPath: '/Documents/WeWork' }), currentWorkspace: async () => ({ kind: 'local', rootPath: '.' }), startRun: async (spec) => { started.push(spec); return { id: 'r', status: 'queued' }; } },
  });
  await scheduler.startPrompt('employee', 'Please address the review feedback');
  expect(started[0].workId).toBe('w');
  expect(started[0].prompt).toContain('review feedback');
  expect(started[0].weworkManaged).toBe(true);
  expect(scheduler.isPromptRun('r')).toBe(false);
});
