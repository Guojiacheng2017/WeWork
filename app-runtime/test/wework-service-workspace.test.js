import assert from 'node:assert/strict';
import test from 'node:test';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeWorkService, FileWeWorkStorage } from '../src/host/wework-service.js';
import { WeWorkWorkspaceLayout } from '../src/host/wework-workspace-layout.js';
import { resolveWeWorkConfiguration } from '../src/host/wework-configuration.js';
import { TeamPartitionedWeWorkStorage } from '../src/host/team-partitioned-wework-storage.js';
import { discoverAvailableSkills } from '../src/skill-loader.js';

test('Pi completion persists real Context usage on the employee Session', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-pi-context-')); t.after(() => rm(root, { recursive: true, force: true }));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')));
  const team = await wework.api.createTeam({ name: 'Pi team' });
  const employeeId = team.employees[0].id;
  const spec = { employeeId, runtimeProfile: { adapter: 'pi' }, wework: { group: false, chat: true } };

  await wework.finish(spec, { finalText: 'done', usage: { input: 40, output: 10, cacheRead: 20, cacheWrite: 5, total: 75, context: { tokens: 60, harnessContextWindow: 200, modelContextWindow: 200, effectiveLimit: 160, percent: 37.5 } } });

  const session = (await wework.api.snapshot()).teams[0].employees[0].activeSession;
  assert.equal(session.contextRatio, 37.5);
  assert.match(session.contextMeasuredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(session.metrics, [
    { label: 'Context tokens', value: 60, maximum: 160, unit: 'tokens' },
    { label: 'Input tokens', value: 40, maximum: 160, unit: 'tokens' },
    { label: 'Output tokens', value: 10, maximum: 160, unit: 'tokens' },
    { label: 'Cache read', value: 20, maximum: 160, unit: 'tokens' },
    { label: 'Cache write', value: 5, maximum: 160, unit: 'tokens' },
  ]);
});

test('Host refuses to archive or delete a team while one of its employees is running', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-team-lifecycle-')); t.after(() => rm(root, { recursive: true, force: true }));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')));
  const team = await wework.api.createTeam({ name: 'Busy Team' });
  wework.attachCoordinator({ runtime: { active: new Map([['run-1', { employeeId: team.employees[0].id }]]) } });

  await assert.rejects(wework.call('archiveTeam', [team.id]));
  assert.equal((await wework.api.snapshot()).teams[0].archivedAt, undefined);
});

test('slow employee workspace initialization does not leave onboarding stuck', async () => {
  const never = new Promise(() => {});
  const workspaceLayout = { ensureEmployee: () => never };
  let state = null;
  const storage = { getItem: () => state, setItem: (_key, value) => { state = value; } };
  const wework = new WeWorkService(storage, { workspaceLayout, workspaceInitializationTimeoutMs: 5 });
  const team = await wework.api.createTeam({ name: 'Empty', initializeLead: false });
  const employee = await wework.call('addEmployee', [team.id, { displayName: 'Adam', roleName: 'Product Manager', runtime: 'Pi' }]);
  assert.equal(employee.displayName, 'Adam');
  assert.equal((await wework.api.snapshot()).teams[0].employees.length, 1);
});

test('prepares a run from the team workspace with global, team and employee configuration layers', async (t) => {
  const documents = await mkdtemp(join(tmpdir(), 'wework-service-workspace-')); t.after(() => rm(documents, { recursive: true, force: true }));
  const weworkRoot = join(documents, 'WeWork'); const configRoot = join(documents, '.wework');
  const layout = new WeWorkWorkspaceLayout({ weworkRoot, configRoot });
  const wework = new WeWorkService(new FileWeWorkStorage(join(configRoot, 'test-state.json')), { workspaceLayout: layout, configRoot, configurationResolver: resolveWeWorkConfiguration });
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' }); const employeeId = team.employees[0].id;
  const profile = await wework.api.createRuntimeProfile({ name: 'Pi', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, enabled: true });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id });
  const work = await wework.api.createWork(team.id, { title: 'Analysis', goal: 'Use inputs', priority: 'medium', category: 'Digital' }); await wework.api.assignWork(work.id, employeeId);
  const teamPaths = await layout.ensureTeam(team); const employeePaths = await layout.ensureEmployee(team, { id: employeeId, displayName: 'Worker' });
  await mkdir(configRoot, { recursive: true }); await writeFile(join(configRoot, 'config.json'), JSON.stringify({ theme: 'dark', context: { maxMessages: 20 } })); await writeFile(join(configRoot, 'WEWORK.md'), 'Global prompt');
  await writeFile(teamPaths.weworkConfig, JSON.stringify({ context: { tags: ['team'] } })); await writeFile(teamPaths.weworkPrompt, 'Team prompt');
  await writeFile(employeePaths.weworkConfig, JSON.stringify({ context: { maxMessages: 8 } })); await writeFile(employeePaths.weworkPrompt, 'Employee prompt');

  const prepared = await wework.prepare({ id: 'run', employeeId, workId: work.id, sessionConfig: { context: { tags: ['session'] } }, taskConfig: { context: { maxMessages: 5 } } });

  assert.deepEqual(prepared.workspace, { kind: 'local', rootPath: employeePaths.root });
  assert.deepEqual(prepared.weworkConfig, { theme: 'dark', context: { maxMessages: 5, tags: ['session'] } });
  assert.deepEqual(prepared.weworkPrompts.map((item) => item.content), ['Global prompt', 'Team prompt', 'Employee prompt']);
});

test('team workspace assignment is the fallback and an employee assignment overrides it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-workspace-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout, configRoot: join(root, '.wework'), configurationResolver: resolveWeWorkConfiguration });
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' }); const employeeId = team.employees[0].id;
  const profile = await wework.api.createRuntimeProfile({ name: 'Pi', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, enabled: true });
  const employeeInput = { displayName: 'Worker', roleName: 'Analyst', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id };
  await wework.api.updateTeamWorkspace(team.id, { kind: 'local', rootPath: join(root, 'team-custom') });
  await wework.api.updateEmployee(employeeId, employeeInput);
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: 'Goal', priority: 'medium', category: 'Digital' }); await wework.api.assignWork(work.id, employeeId);
  assert.equal((await wework.prepare({ id: 'team-run', employeeId, workId: work.id })).workspace.rootPath, join(root, 'team-custom'));
  await wework.api.updateEmployee(employeeId, { ...employeeInput, workspaceAssignment: { kind: 'local', rootPath: join(root, 'employee-custom') } });
  assert.equal((await wework.prepare({ id: 'employee-run', employeeId, workId: work.id })).workspace.rootPath, join(root, 'employee-custom'));
});

test('a rootless legacy local assignment migrates to the canonical employee directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-current-workspace-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout, currentWorkspace: async () => ({ kind: 'local', rootPath: join(root, 'selected-current') }) });
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' }); const employeeId = team.employees[0].id;
  const profile = await wework.api.createRuntimeProfile({ name: 'Pi', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, enabled: true });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id });
  await wework.api.updateTeamWorkspace(team.id, { kind: 'local' });
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: 'Goal', priority: 'medium', category: 'Digital' }); await wework.api.assignWork(work.id, employeeId);

  const prepared = await wework.prepare({ id: 'current-run', employeeId, workId: work.id });

  const employeePaths = await layout.ensureEmployee(team, { id: employeeId, displayName: 'Worker' });
  assert.deepEqual(prepared.workspace, { kind: 'local', rootPath: employeePaths.root });
});

test('Host validates SSH credential references before mutation and prepare', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-credential-')); t.after(() => rm(root, { recursive: true, force: true }));
  const credentials = [{ ref: 'keychain:ssh/gpu', label: 'SSH', kind: 'ssh-private-key' }, { ref: 'keychain:model-only', label: 'Model', kind: 'model-api-key' }];
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { listCredentials: async () => credentials });
  const team = await wework.api.createTeam({ name: 'Team', runtime: 'Workspace' }); const employeeId = team.employees[0].id;
  const ssh = (credentialRef) => ({ kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/srv/team', credentialRef });

  await assert.rejects(wework.call('updateTeamWorkspace', [team.id, ssh('keychain:missing')]), /credential reference/i);
  await assert.rejects(wework.call('updateTeamWorkspace', [team.id, ssh('keychain:model-only')]), /SSH credential/i);
  assert.equal((await wework.api.snapshot()).teams[0].workspaceAssignment, undefined);
  await wework.call('updateTeamWorkspace', [team.id, ssh('keychain:ssh/gpu')]);

  const profile = await wework.api.createRuntimeProfile({ name: 'Pi', adapter: 'pi', model: { provider: 'pi', modelId: 'default' }, enabled: true });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'Pi', skills: [], defaultRuntimeProfileId: profile.id, workspaceAssignment: ssh('keychain:missing') });
  const work = await wework.api.createWork(team.id, { title: 'Work', goal: 'Goal', priority: 'medium', category: 'Digital' }); await wework.api.assignWork(work.id, employeeId);
  await assert.rejects(wework.prepare({ id: 'bad-credential-run', employeeId, workId: work.id }), /credential reference/i);
});

test('startup reconciliation keeps unresolved SSH metadata repairable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-unresolved-ssh-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const storage = new FileWeWorkStorage(join(root, 'state.json'));
  const seed = new WeWorkService(storage);
  const team = await seed.api.createTeam({ name: 'Repairable team' });
  await seed.api.updateTeamWorkspace(team.id, { kind: 'ssh', host: 'old.example.com', port: 22, username: 'alice', rootPath: '/old', credentialRef: 'keychain:missing/path' });
  const wework = new WeWorkService(storage, { workspaceLayout: layout, listCredentials: async () => [] });

  await wework.reconcileWorkspaces();

  assert.equal((await wework.api.snapshot()).teams[0].workspaceAssignment.credentialRef, 'keychain:missing/path');
  assert.equal(JSON.parse(await readFile(layout.paths(team.id).manifest, 'utf8')).id, team.id);
});

test('a stale browser backup cannot block a no-op Host import', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-noop-import-')); t.after(() => rm(root, { recursive: true, force: true }));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { listCredentials: async () => [] });
  await wework.api.createTeam({ name: 'Authoritative Host team' });
  const stale = { teams: [{ id: 'stale-team', name: 'Stale', employees: [], pendingWorks: [], workspaceAssignment: { kind: 'ssh', host: 'old.example.com', port: 22, username: 'alice', rootPath: '/old', credentialRef: 'keychain:missing' } }], runtimeProfiles: [], eventCursor: 0 };

  assert.deepEqual(await wework.call('importLocalState', [stale]), { imported: false });
  assert.deepEqual((await wework.api.snapshot()).teams.map((team) => team.name), ['Authoritative Host team']);
});

test('effective WeWork config overrides supported runtime settings', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-runtime-config-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'WeWork'); const configRoot = join(root, '.wework');
  const layout = new WeWorkWorkspaceLayout({ weworkRoot, configRoot });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout, configRoot, configurationResolver: resolveWeWorkConfiguration });
  const team = await wework.api.createTeam({ name: 'Configured team' }); const employeeId = team.employees[0].id;
  const profile = await wework.api.createRuntimeProfile({ name: 'Base', adapter: 'smalldash', model: { provider: 'openai', modelId: 'base', baseUrl: 'http://127.0.0.1:8000/v1', contextWindow: 4096, maxTokens: 256 }, systemPrompt: 'Session prompt', thinkingLevel: 'off', enabled: true });
  await wework.api.updateEmployee(employeeId, { displayName: 'Worker', roleName: 'Analyst', runtime: 'DSH', skills: [], defaultRuntimeProfileId: profile.id });
  const work = await wework.api.createWork(team.id, { title: 'Configured work', goal: 'Goal', priority: 'medium', category: 'Digital' }); await wework.api.assignWork(work.id, employeeId);
  const paths = await layout.ensureTeam(team);
  await writeFile(paths.weworkConfig, JSON.stringify({ model: { modelId: 'team-model', maxTokens: 1024 }, context: { maxMessages: 3 }, permissions: { network: false } }));

  const prepared = await wework.prepare({ id: 'configured-run', employeeId, workId: work.id, taskConfig: { model: { contextWindow: 8192 } } });

  assert.deepEqual(prepared.runtimeProfile.model, { provider: 'openai', modelId: 'team-model', baseUrl: 'http://127.0.0.1:8000/v1', contextWindow: 8192, maxTokens: 1024 });
  assert.deepEqual(prepared.runtimeSettings, { context: { maxMessages: 3 }, permissions: { network: false } });

  await writeFile(paths.weworkConfig, JSON.stringify({ model: { api: 'not-a-runtime-api' } }));
  await assert.rejects(() => wework.prepare({ id: 'invalid-configured-run', employeeId, workId: work.id }), /runtime profile|invalid/i);
  await writeFile(paths.weworkConfig, JSON.stringify({ harness: { id: 'pi' } }));
  await assert.rejects(() => wework.prepare({ id: 'harness-switch-run', employeeId, workId: work.id }), /Harness|adapter|Session/i);
});

test('external Desktop runs initialize canonical workspace and resolve the same config and prompts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-external-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'WeWork'); const configRoot = join(root, '.wework');
  const layout = new WeWorkWorkspaceLayout({ weworkRoot, configRoot });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout, configRoot, configurationResolver: resolveWeWorkConfiguration, currentWorkspace: async () => ({ kind: 'local', rootPath: join(root, 'selected') }) });
  const team = { id: 'remote-team', name: 'Remote Team' };
  const employee = { id: 'remote-employee', displayName: 'Remote Employee', roleName: 'Analyst', skills: [], workspaceAssignment: { kind: 'local' } };
  const teamPaths = await layout.ensureTeam({ ...team, employees: [employee] }); const employeePaths = await layout.ensureEmployee({ ...team, employees: [employee] }, employee);
  await writeFile(teamPaths.weworkPrompt, 'Remote team prompt'); await writeFile(employeePaths.weworkPrompt, 'Remote employee prompt');
  await writeFile(teamPaths.weworkConfig, JSON.stringify({ model: { modelId: 'remote-override' } }));
  let started;
  const runtime = { start: async (spec) => { started = spec; return { id: spec.id, status: 'queued' }; } };
  const spec = { id: 'external-run', employeeId: employee.id, weworkManaged: false, team, employee, workId: 'chat-external', work: { id: 'chat-external', title: 'Conversation', goal: 'Help' }, runtimeProfile: { id: 'external-profile', name: 'DSH', adapter: 'smalldash', model: { provider: 'openai', modelId: 'base', baseUrl: 'http://127.0.0.1:8000/v1' }, systemPrompt: 'Session prompt', thinkingLevel: 'off', enabled: true }, session: { id: 'external-session', nativeSessionId: 'native-external-session', messages: [] } };

  await wework.startExternalRun(spec, runtime);

  assert.equal(started.workspace.rootPath, employeePaths.root);
  assert.equal(started.runtimeProfile.model.modelId, 'remote-override');
  assert.deepEqual(started.weworkPrompts.map((layer) => layer.content), ['Remote team prompt', 'Remote employee prompt']);
  assert.equal(started.session.nativeSessionId, 'native-external-session');
  assert.equal(JSON.parse(await readFile(teamPaths.manifest, 'utf8')).name, 'Remote Team');
});

test('Skill discovery resolves an inherited employee assignment against the team workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-skills-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout, currentWorkspace: async () => ({ kind: 'local', rootPath: join(root, 'current') }) });
  const team = await wework.api.createTeam({ name: 'Skill team' }); const employeeId = team.employees[0].id;
  await wework.api.updateTeamWorkspace(team.id, { kind: 'local', rootPath: join(root, 'team-workspace') });
  const teamPaths = await layout.ensureTeam(team);
  const employeePaths = await layout.ensureEmployee(team, team.employees[0]);
  await mkdir(join(teamPaths.skills, 'team-review'), { recursive: true });
  await writeFile(join(teamPaths.skills, 'team-review', 'SKILL.md'), '# Team Review\nReview team work.');
  await mkdir(join(employeePaths.skills, 'employee-analysis'), { recursive: true });
  await writeFile(join(employeePaths.skills, 'employee-analysis', 'SKILL.md'), '# Employee Analysis\nAnalyze assigned work.');

  assert.deepEqual(await wework.resolveSkillWorkspace({ teamId: team.id, employeeId }), { kind: 'local', rootPath: join(root, 'team-workspace') });
  const context = await wework.resolveSkillCatalog({ teamId: team.id, employeeId });
  const discovered = await discoverAvailableSkills({ workspaceRoot: context.workspace.rootPath, skillRoots: context.skillRoots });
  assert.deepEqual(discovered.map((skill) => skill.id), ['employee-analysis', 'team-review']);
});

test('Skill discovery resolves remote Desktop metadata without requiring a duplicate Host snapshot', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-external-skills-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'host-state.json')), { workspaceLayout: layout, currentWorkspace: async () => ({ kind: 'local', rootPath: join(root, 'current') }) });
  const assignment = { kind: 'local', rootPath: join(root, 'remote-team-workspace') };

  const context = await wework.resolveSkillCatalog({
    team: { id: 'remote-team', name: 'Remote team', workspaceAssignment: assignment },
    employee: { id: 'remote-employee', displayName: 'Remote employee' },
  });

  assert.deepEqual(context.workspace, assignment);
  assert.equal(context.skillRoots[0], layout.paths('remote-team', 'remote-employee').skills);
  assert.deepEqual(JSON.parse(await readFile(layout.paths('remote-team', 'remote-employee').manifest, 'utf8')), {
    schemaVersion: 1,
    id: 'remote-employee',
    displayName: 'Remote employee',
    teamId: 'remote-team',
  });
});

test('legacy direct SSH Skill discovery remains remote and never falls back to the Host current directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-ssh-skills-')); t.after(() => rm(root, { recursive: true, force: true }));
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { currentWorkspace: async () => ({ kind: 'local', rootPath: join(root, 'current') }) });
  const assignment = { kind: 'ssh', host: 'gpu.example.com', port: 22, username: 'alice', rootPath: '/work', credentialRef: 'vault:ssh/team' };

  assert.deepEqual(await wework.resolveSkillWorkspace(assignment), assignment);
});

test('creating a team initializes its canonical workspace and lead membership', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-create-team-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout });

  const team = await wework.call('createTeam', [{ name: 'Created team', leadName: 'Lead' }]);

  assert.deepEqual(JSON.parse(await readFile(layout.paths(team.id).manifest, 'utf8')), { schemaVersion: 1, id: team.id, name: 'Created team' });
  assert.deepEqual(JSON.parse(await readFile(layout.paths(team.id, team.employees[0].id).manifest, 'utf8')), { schemaVersion: 1, id: team.employees[0].id, displayName: 'Lead', teamId: team.id });
});

test('adding an employee initializes an independent team-local membership workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-add-employee-')); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout });
  const team = await wework.api.createTeam({ name: 'Existing team' });

  const employee = await wework.call('addEmployee', [team.id, { displayName: 'Analyst', roleName: 'Reviewer', runtime: 'Workspace' }]);

  assert.deepEqual(JSON.parse(await readFile(layout.paths(team.id, employee.id).manifest, 'utf8')), { schemaVersion: 1, id: employee.id, displayName: 'Analyst', teamId: team.id });
});

for (const method of ['bootstrap', 'importLocalState']) test(`${method} initializes imported team and employee workspaces`, async (t) => {
  const root = await mkdtemp(join(tmpdir(), `wework-service-${method}-`)); t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'WeWork'), configRoot: join(root, '.wework') });
  const wework = new WeWorkService(new FileWeWorkStorage(join(root, 'state.json')), { workspaceLayout: layout });
  const employee = { id: 'employee-imported', displayName: 'Imported worker', roleName: 'Analyst', runtime: 'Workspace', status: 'idle', builtInSkills: [], activeSession: { id: 'session-imported', contextRatio: 0, updatedAt: '2026-09-01T00:00:00.000Z', messages: [], metrics: [] }, artifacts: [], queuedWorkItems: [], completedWorkItems: [] };
  const team = { id: 'team-imported', name: 'Imported team', description: '', topology: 'roundTable', employees: [employee], pendingWorks: [] };
  const input = method === 'bootstrap' ? [team] : { teams: [team], runtimeProfiles: [], eventCursor: 4 };

  assert.deepEqual(await wework.call(method, [input]), { imported: true });
  assert.equal(JSON.parse(await readFile(layout.paths(team.id).manifest, 'utf8')).name, 'Imported team');
  assert.equal(JSON.parse(await readFile(layout.paths(team.id, employee.id).manifest, 'utf8')).displayName, 'Imported worker');
});

test('startup reconciliation fully initializes workspaces imported from legacy hashed snapshots', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-service-startup-migration-')); t.after(() => rm(root, { recursive: true, force: true }));
  const legacyRoot = join(root, '.wework');
  const employee = { id: 'employee-migrated', displayName: 'Migrated worker', roleName: 'Analyst', runtime: 'Workspace', status: 'idle', builtInSkills: [], activeSession: { id: 'session-migrated', contextRatio: 0, updatedAt: '2026-09-01T00:00:00.000Z', messages: [], metrics: [] }, artifacts: [], queuedWorkItems: [], completedWorkItems: [] };
  const team = { id: 'team-migrated', name: 'Migrated team', description: '', topology: 'roundTable', employees: [employee], pendingWorks: [] };
  new TeamPartitionedWeWorkStorage(legacyRoot).setItem('', JSON.stringify({ teams: [team], runtimeProfiles: [], eventCursor: 7 }));
  const weworkRoot = join(root, 'Documents', 'WeWork'); const configRoot = join(root, 'Documents', '.wework');
  const layout = new WeWorkWorkspaceLayout({ weworkRoot, configRoot });
  const storage = new TeamPartitionedWeWorkStorage(weworkRoot, {
    legacyPath: join(legacyRoot, 'wework.json'), indexPath: join(configRoot, 'wework-index.json'),
    teamPath: (teamId, file) => join(layout.paths(teamId).state, file),
  });
  const wework = new WeWorkService(storage, { workspaceLayout: layout });

  await wework.reconcileWorkspaces();

  const teamPaths = layout.paths(team.id); const employeePaths = layout.paths(team.id, employee.id);
  assert.deepEqual(JSON.parse(await readFile(teamPaths.manifest, 'utf8')), { schemaVersion: 1, id: team.id, name: team.name });
  assert.deepEqual(JSON.parse(await readFile(employeePaths.manifest, 'utf8')), { schemaVersion: 1, id: employee.id, displayName: employee.displayName, teamId: team.id });
  assert.match(await readFile(teamPaths.weworkPrompt, 'utf8'), /Team instructions/);
  assert.match(await readFile(employeePaths.weworkPrompt, 'utf8'), /Employee instructions/);
  assert.deepEqual(JSON.parse(await readFile(teamPaths.weworkConfig, 'utf8')), {});
  assert.deepEqual(JSON.parse(await readFile(employeePaths.weworkConfig, 'utf8')), {});
  for (const path of [teamPaths.chat, teamPaths.context, teamPaths.plans, teamPaths.issues, teamPaths.workflows, teamPaths.skills, teamPaths.settings, teamPaths.employees, teamPaths.shared, teamPaths.artifacts, teamPaths.state, employeePaths.context, employeePaths.sessions, employeePaths.skills, employeePaths.workspace, employeePaths.artifacts]) {
    assert.equal((await lstat(path)).isDirectory(), true, `${path} should be initialized`);
  }
  await writeFile(teamPaths.weworkPrompt, 'Customized migrated instructions');
  await writeFile(employeePaths.weworkConfig, JSON.stringify({ theme: 'custom' }));
  await wework.reconcileWorkspaces();
  assert.equal(await readFile(teamPaths.weworkPrompt, 'utf8'), 'Customized migrated instructions');
  assert.deepEqual(JSON.parse(await readFile(employeePaths.weworkConfig, 'utf8')), { theme: 'custom' });
});

test('renderer broadcasts preserve inline tags without accepting a forged actor',async(t)=>{
 const root=await mkdtemp(join(tmpdir(),'wework-broadcast-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const service=new WeWorkService(new FileWeWorkStorage(join(root,'state.json')));
 const team=await service.api.createTeam({name:'Broadcast'});
 const message=await service.call('sendTeamMessage',[team.id,'Hello #进度',{employeeId:team.employees[0].id,runId:'forged'},['进度']]);
 assert.equal(message.sender,'user');assert.equal(message.broadcast,true);assert.deepEqual(message.contextTagIds,['进度']);assert.equal(message.sourceRunId,undefined);
});

test('desktop project import validates and preserves the previous database on failure', async t => {
 const root=await mkdtemp(join(tmpdir(),'wework-project-import-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const service=new WeWorkService(new FileWeWorkStorage(join(root,'state.json')));
 const team=await service.api.createTeam({name:'Import test'});
 await service.call('configureTeamModules',[team.id,{projectManagement:{installed:true,enabled:true,capabilities:['issues']}}]);
 await service.call('createCollaborationWorkItem',[team.id,{projectId:'project-main',title:'Saved item'}]);
 const before=(await service.api.snapshot()).teams[0].collaborationDatabase;
 await assert.rejects(service.call('replaceCollaborationDatabase',[team.id,{}]));
 assert.deepEqual((await service.api.snapshot()).teams[0].collaborationDatabase,before);
 await service.call('replaceCollaborationDatabase',[team.id,before]);
 assert.deepEqual((await service.api.snapshot()).teams[0].collaborationDatabase,before);
});

test('restarting employee context waits for execution and retains old messages as history', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-context-lifecycle-')); t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new FileWeWorkStorage(join(root, 'state.json'));
  const wework = new WeWorkService(storage);
  const team = await wework.api.createTeam({ name: 'Sessions' });
  const id = team.employees[0].id;
  const original = team.employees[0].activeSession.id;
  let failStop = true;
  wework.attachCoordinator({ runtime: { active: new Map() },
    withEmployees: async (ids, fn) => { assert.deepEqual(ids, [id]); return fn(); },
    stopEmployee: async () => { if (failStop) throw new Error('cannot stop'); await wework.api.sendAssistantMessage(id, 'final old reply'); },
  });
  await assert.rejects(wework.call('resetEmployeeContext', [id]), /cannot stop/);
  assert.equal((await wework.api.snapshot()).teams[0].employees[0].activeSession.id, original);
  failStop = false;
  await wework.call('resetEmployeeContext', [id]);
  const employee = (await new WeWorkService(storage).api.snapshot()).teams[0].employees[0];
  assert.notEqual(employee.activeSession.id, original);
  assert.equal(employee.activeSession.messages.length, 0);
  assert.equal(employee.sessionHistory[0].messages.at(-1).text, 'final old reply');
});

test('native command dispatch rejects unsupported commands and uses authoritative employee session', async () => {
  let saved=null, received;
  const wework = new WeWorkService({getItem:()=>saved,setItem:(_key,value)=>{saved=value;}}, {nativePiCommand:async(spec,command)=>{received={spec,command};return {totalMessages:3};}});
  const team=await wework.api.createTeam({name:'Native',runtime:'Workspace'});
  const id=team.employees[0].id;
  const profile=await wework.api.createRuntimeProfile({name:'Pi',adapter:'pi',model:{provider:'pi',modelId:'default'},enabled:true,systemPrompt:'',thinkingLevel:'off'});
  await wework.api.updateEmployee(id,{displayName:'Native',roleName:'QA',runtime:'Pi',skills:[],defaultRuntimeProfileId:profile.id});
  wework.attachCoordinator({transitioning:new Set(),withAdmission:async(employeeId,fn)=>{assert.equal(employeeId,id);return fn();},runtime:{}});
  await wework.call('nativeHarnessCommand',[id,'pi:status']);
  assert.equal(received.spec.session.id,`${team.employees[0].activeSession.id}-chat-${profile.id}`);
  assert.equal(received.command,'status');
  wework.nativePiCommand=async()=>{throw new Error('Nothing to compact (session too small)');};
  assert.deepEqual(await wework.call('nativeHarnessCommand',[id,'pi:compact']),{skipped:true});
  await assert.rejects(wework.call('nativeHarnessCommand',[id,'pi:clear']),/不支持/);
});
test('missing legacy generated employee path resolves to canonical directory without rewriting custom paths',async(t)=>{
 const root=await mkdtemp(join(tmpdir(),'legacy-employee-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const layout=new WeWorkWorkspaceLayout({weworkRoot:root,configRoot:join(root,'.config')});
 const wework=new WeWorkService(new FileWeWorkStorage(join(root,'state.json')),{workspaceLayout:layout});
 const team=await wework.api.createTeam({name:'Legacy',runtime:'Workspace'});const id=team.employees[0].id;
 const profile=await wework.api.createRuntimeProfile({name:'Pi',adapter:'pi',model:{provider:'pi',modelId:'default'},enabled:true,systemPrompt:'',thinkingLevel:'off'});
 const input={displayName:'Worker',roleName:'QA',runtime:'Pi',skills:[],defaultRuntimeProfileId:profile.id};
 await wework.api.updateEmployee(id,{...input,workspaceAssignment:{kind:'local',rootPath:join(root,team.name,'employees',id)}});
 const spec={id:'test',employeeId:id,workId:'chat-test',work:{goal:'hello'}};
 const prepared=await wework.prepare(spec);assert.equal(prepared.workspace.rootPath,layout.paths(team.id,id).root);
 await wework.api.updateEmployee(id,{...input,workspaceAssignment:{kind:'local',rootPath:join(root,'custom-missing')}});
 assert.equal((await wework.prepare(spec)).workspace.rootPath,join(root,'custom-missing'));
});
