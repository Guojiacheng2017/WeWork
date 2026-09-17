import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeamPartitionedWeWorkStorage, durableSync, safeTeamDirectory } from '../src/host/team-partitioned-wework-storage.js';
import { createLocalWeWorkApi } from '../../src/local/localWeWorkApi.ts';

const state = (teams, cursor = 1) => JSON.stringify({ teams, runtimeProfiles: [], eventCursor: cursor });

test('continues after Windows rejects fsync with EPERM', () => {
  const error = Object.assign(new Error('operation not permitted, fsync'), { code: 'EPERM' });
  assert.doesNotThrow(() => durableSync(7, { platform: 'win32', sync: () => { throw error; } }));
});

test('does not hide fsync failures outside the Windows EPERM case', () => {
  for (const [platform, code] of [['linux', 'EPERM'], ['win32', 'EIO']]) {
    const error = Object.assign(new Error(`${code}, fsync`), { code });
    assert.throws(() => durableSync(7, { platform, sync: () => { throw error; } }), error);
  }
});

test('migrates legacy state once and preserves an unchanged backup', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-partition-')); t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = state([{ id: 'team/a', name: 'A' }]);
  await writeFile(join(root, 'wework.json'), legacy);
  const storage = new TeamPartitionedWeWorkStorage(root);
  assert.deepEqual(JSON.parse(storage.getItem()).teams.map((team) => team.id), ['team/a']);
  assert.equal(await readFile(join(root, 'wework.json.v1.backup'), 'utf8'), legacy);
  storage.setItem('', state([{ id: 'team/a', name: 'changed' }]));
  assert.equal(await readFile(join(root, 'wework.json.v1.backup'), 'utf8'), legacy);
  assert.match(safeTeamDirectory('../team/a'), /^team-[a-f0-9]{64}$/);
});

test('isolates teams in distinct hash directories', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-partition-')); t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new TeamPartitionedWeWorkStorage(root);
  storage.setItem('', state([{ id: 'a', secret: 'alpha' }, { id: 'b', secret: 'beta' }]));
  const index = JSON.parse(await readFile(join(root, 'wework-index.json'), 'utf8'));
  assert.notEqual(safeTeamDirectory('a'), safeTeamDirectory('b'));
  const a = await readFile(join(root, 'teams', safeTeamDirectory('a'), index.teams[0].file), 'utf8');
  const b = await readFile(join(root, 'teams', safeTeamDirectory('b'), index.teams[1].file), 'utf8');
  assert.match(a, /alpha/); assert.doesNotMatch(a, /beta/);
  assert.match(b, /beta/); assert.doesNotMatch(b, /alpha/);
});

test('a crash before index promotion keeps the previous complete snapshot visible', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-partition-')); t.after(() => rm(root, { recursive: true, force: true }));
  const initial = new TeamPartitionedWeWorkStorage(root);
  initial.setItem('', state([{ id: 'a', value: 'old' }], 1));
  const crashing = new TeamPartitionedWeWorkStorage(root, { hooks: { beforeRename(path) { if (path.endsWith('wework-index.json')) throw new Error('simulated crash'); } } });
  assert.throws(() => crashing.setItem('', state([{ id: 'a', value: 'new' }], 2)), /simulated crash/);
  assert.deepEqual(JSON.parse(initial.getItem()).teams, [{ id: 'a', value: 'old' }]);
  assert.equal(JSON.parse(initial.getItem()).eventCursor, 1);
});

test('supports canonical team workspace snapshots with a device-level index', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-canonical-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'Documents', 'WeWork'); const configRoot = join(root, 'Documents', '.wework');
  const storage = new TeamPartitionedWeWorkStorage(weworkRoot, { indexPath: join(configRoot, 'wework-index.json'), teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file) });
  storage.setItem('', state([{ id: 'team-a', name: 'A' }]));
  const index = JSON.parse(await readFile(join(configRoot, 'wework-index.json'), 'utf8'));
  assert.equal(JSON.parse(await readFile(join(weworkRoot, 'team-a', '.wework-state', index.teams[0].file), 'utf8')).name, 'A');
  assert.equal(JSON.parse(storage.getItem()).teams[0].id, 'team-a');
});

test('persists the shared collaboration database inside the team workspace across restart', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-project-restart-')); t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new TeamPartitionedWeWorkStorage(root);
  const api = createLocalWeWorkApi(storage);
  const team = await api.createTeam({ name: 'Project team', runtime: 'Workspace' });
  await api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: true, capabilities: ['issues', 'board', 'gantt'] } });
  const item = await api.createCollaborationWorkItem(team.id, { projectId: 'project-main', title: 'Survives restart', startDate: '2026-09-02', dueDate: '2026-09-03' });

  const restarted = createLocalWeWorkApi(new TeamPartitionedWeWorkStorage(root));
  assert.equal((await restarted.snapshot()).teams[0].collaborationDatabase.workItems[0].id, item.id);
});

test('imports prior hashed snapshots without changing the legacy partitioned store', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-canonical-migration-')); t.after(() => rm(root, { recursive: true, force: true }));
  const legacyRoot = join(root, '.wework');
  const legacyStorage = new TeamPartitionedWeWorkStorage(legacyRoot);
  const partitioned = JSON.stringify({ teams: [{ id: 'team-a', name: 'Partitioned' }], runtimeProfiles: [{ id: 'runtime-a' }], eventCursor: 9 });
  legacyStorage.setItem('', partitioned);
  const staleMonolith = state([{ id: 'team-a', name: 'Stale monolith' }], 2);
  await writeFile(join(legacyRoot, 'wework.json'), staleMonolith);
  const legacyIndexPath = join(legacyRoot, 'wework-index.json');
  const legacyIndex = await readFile(legacyIndexPath, 'utf8');
  const legacyEntry = JSON.parse(legacyIndex).teams[0];
  const legacyTeamPath = join(legacyRoot, 'teams', safeTeamDirectory('team-a'), legacyEntry.file);
  const legacyTeam = await readFile(legacyTeamPath, 'utf8');

  const weworkRoot = join(root, 'Documents', 'WeWork');
  const configRoot = join(root, 'Documents', '.wework');
  const storage = new TeamPartitionedWeWorkStorage(weworkRoot, {
    legacyPath: join(legacyRoot, 'wework.json'),
    indexPath: join(configRoot, 'wework-index.json'),
    teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
  });

  const migrated = JSON.parse(storage.getItem());
  assert.equal(migrated.teams[0].name, 'Partitioned');
  assert.deepEqual(migrated.runtimeProfiles, [{ id: 'runtime-a' }]);
  assert.equal(migrated.eventCursor, 9);
  const canonicalIndex = JSON.parse(await readFile(join(configRoot, 'wework-index.json'), 'utf8'));
  assert.equal(JSON.parse(await readFile(join(weworkRoot, 'team-a', '.wework-state', canonicalIndex.teams[0].file), 'utf8')).name, 'Partitioned');
  assert.equal(await readFile(legacyIndexPath, 'utf8'), legacyIndex);
  assert.equal(await readFile(legacyTeamPath, 'utf8'), legacyTeam);
  assert.equal(await readFile(join(legacyRoot, 'wework.json'), 'utf8'), staleMonolith);
});

test('imports the actual packaged Documents WeWork store before the home-directory fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-packaged-migration-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'Documents', 'WeWork');
  const configRoot = join(root, 'Documents', '.wework');
  const homeLegacyRoot = join(root, '.wework');
  const packaged = new TeamPartitionedWeWorkStorage(weworkRoot);
  const home = new TeamPartitionedWeWorkStorage(homeLegacyRoot);
  packaged.setItem('', state([{ id: 'packaged-team', name: 'Packaged state' }], 11));
  home.setItem('', state([{ id: 'home-team', name: 'Home fallback' }], 3));
  const packagedIndex = await readFile(join(weworkRoot, 'wework-index.json'), 'utf8');
  const packagedEntry = JSON.parse(packagedIndex).teams[0];
  const packagedTeamPath = join(weworkRoot, 'teams', safeTeamDirectory('packaged-team'), packagedEntry.file);
  const packagedTeam = await readFile(packagedTeamPath, 'utf8');

  const canonical = new TeamPartitionedWeWorkStorage(weworkRoot, {
    legacyPath: join(homeLegacyRoot, 'wework.json'),
    indexPath: join(configRoot, 'wework-index.json'),
    teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
    legacySources: [
      { indexPath: join(weworkRoot, 'wework-index.json'), legacyPath: join(weworkRoot, 'wework.json'), teamPath: (teamId, file) => join(weworkRoot, 'teams', safeTeamDirectory(teamId), file) },
      { indexPath: join(homeLegacyRoot, 'wework-index.json'), legacyPath: join(homeLegacyRoot, 'wework.json'), teamPath: (teamId, file) => join(homeLegacyRoot, 'teams', safeTeamDirectory(teamId), file) },
    ],
  });

  assert.deepEqual(JSON.parse(canonical.getItem()).teams.map((team) => team.id), ['packaged-team']);
  assert.equal(JSON.parse(canonical.getItem()).eventCursor, 11);
  assert.equal(await readFile(join(weworkRoot, 'wework-index.json'), 'utf8'), packagedIndex);
  assert.equal(await readFile(packagedTeamPath, 'utf8'), packagedTeam);
});

test('a canonical destination wins and legacy migration remains idempotent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-migration-idempotent-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'Documents', 'WeWork');
  const configRoot = join(root, 'Documents', '.wework');
  const old = new TeamPartitionedWeWorkStorage(weworkRoot);
  old.setItem('', state([{ id: 'old', name: 'Old' }], 1));
  const options = {
    indexPath: join(configRoot, 'wework-index.json'),
    teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
    legacySources: [{ indexPath: join(weworkRoot, 'wework-index.json'), legacyPath: join(weworkRoot, 'wework.json'), teamPath: (teamId, file) => join(weworkRoot, 'teams', safeTeamDirectory(teamId), file) }],
  };
  const canonical = new TeamPartitionedWeWorkStorage(weworkRoot, options);
  canonical.setItem('', state([{ id: 'new', name: 'New' }], 9));
  const before = await readFile(join(configRoot, 'wework-index.json'), 'utf8');

  assert.deepEqual(JSON.parse(new TeamPartitionedWeWorkStorage(weworkRoot, options).getItem()).teams.map((team) => team.id), ['new']);
  assert.equal(await readFile(join(configRoot, 'wework-index.json'), 'utf8'), before);
});

test('a present but unreadable packaged index fails closed instead of hiding newer state with a fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-migration-corrupt-authority-')); t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'Documents', 'WeWork'); const configRoot = join(root, 'Documents', '.wework'); const homeRoot = join(root, '.wework');
  const packaged = new TeamPartitionedWeWorkStorage(weworkRoot); packaged.setItem('', state([{ id: 'newer-team', name: 'Newer' }], 9));
  const packagedIndex = JSON.parse(await readFile(join(weworkRoot, 'wework-index.json'), 'utf8'));
  await writeFile(join(weworkRoot, 'teams', safeTeamDirectory('newer-team'), packagedIndex.teams[0].file), '{broken');
  const home = new TeamPartitionedWeWorkStorage(homeRoot); home.setItem('', state([{ id: 'older-team', name: 'Older fallback' }], 2));
  const canonical = new TeamPartitionedWeWorkStorage(weworkRoot, {
    indexPath: join(configRoot, 'wework-index.json'), teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
    legacySources: [
      { indexPath: join(weworkRoot, 'wework-index.json'), legacyPath: join(weworkRoot, 'wework.json'), teamPath: (teamId, file) => join(weworkRoot, 'teams', safeTeamDirectory(teamId), file) },
      { indexPath: join(homeRoot, 'wework-index.json'), legacyPath: join(homeRoot, 'wework.json'), teamPath: (teamId, file) => join(homeRoot, 'teams', safeTeamDirectory(teamId), file) },
    ],
  });

  assert.throws(() => canonical.getItem(), /JSON|snapshot/i);
  await assert.rejects(readFile(join(configRoot, 'wework-index.json'), 'utf8'), (error) => error.code === 'ENOENT');
});

test('read cache observes external index writes and in-place team edits', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-cache-')); t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new TeamPartitionedWeWorkStorage(root);
  storage.setItem('', state([{ id: 'a', name: 'first' }]));
  assert.equal(storage.getItem(), storage.getItem());
  const other = new TeamPartitionedWeWorkStorage(root);
  other.setItem('', state([{ id: 'a', name: 'external replacement' }]));
  assert.equal(JSON.parse(storage.getItem()).teams[0].name, 'external replacement');
  const index = JSON.parse(await readFile(join(root, 'wework-index.json'), 'utf8'));
  await writeFile(join(root, 'teams', safeTeamDirectory('a'), index.teams[0].file), JSON.stringify({ id: 'a', name: 'in-place edit with a different size' }));
  assert.equal(JSON.parse(storage.getItem()).teams[0].name, 'in-place edit with a different size');
});

for (const canonical of [false, true]) test(`snapshot retention and crash safety, canonical=${canonical}`, async t => {
  const { readdir, utimes } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'wework-retention-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = id => canonical ? join(root, id, '.wework-state') : join(root, 'teams', safeTeamDirectory(id));
  const options = canonical ? { teamPath: (id, file) => join(folder(id), file) } : {};
  const storage = new TeamPartitionedWeWorkStorage(root, options);
  for (let revision = 0; revision < 6; revision++) {
    storage.setItem('', state(['a', 'b'].map(id => ({ id, revision, messages: ['preserved'] }))));
    const index = JSON.parse(await readFile(storage.indexPath, 'utf8'));
    for (const entry of index.teams) await utimes(join(folder(entry.id), entry.file), 100 + revision, 100 + revision);
  }
  for (const id of ['a', 'b']) {
    const files = await readdir(folder(id));
    assert.equal(files.length, 3);
    const revisions = await Promise.all(files.map(async file => JSON.parse(await readFile(join(folder(id), file), 'utf8')).revision));
    assert.deepEqual(revisions.sort(), [3, 4, 5]);
  }
  const before = await readFile(storage.indexPath, 'utf8');
  const retained = await readdir(folder('a'));
  await writeFile(join(folder('a'), 'team.json'), 'legacy');
  await writeFile(join(folder('a'), 'notes.json'), 'unrelated');
  const crashing = new TeamPartitionedWeWorkStorage(root, { ...options, hooks: { beforeRename(path) {
    if (path === storage.indexPath) throw new Error('index failure');
  } } });
  assert.throws(() => crashing.setItem('', state([{ id: 'a', revision: 6 }])), /index failure/);
  assert.equal(await readFile(storage.indexPath, 'utf8'), before);
  for (const file of retained) assert.ok(await readFile(join(folder('a'), file)));
  assert.deepEqual(JSON.parse(new TeamPartitionedWeWorkStorage(root, options).getItem()).teams,
    ['a', 'b'].map(id => ({ id, revision: 5, messages: ['preserved'] })));
  storage.setItem('', state([{ id: 'a', revision: 7 }]));
  assert.equal(await readFile(join(folder('a'), 'team.json'), 'utf8'), 'legacy');
  assert.equal(await readFile(join(folder('a'), 'notes.json'), 'utf8'), 'unrelated');
  assert.equal((await readdir(folder('a'))).filter(file => /^team\.[a-f0-9-]+\.json$/.test(file)).length, 3);
});

test('unchanged teams reuse snapshots and identical saves perform no writes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'wework-dedup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writes = [];
  const storage = new TeamPartitionedWeWorkStorage(root, { hooks: { beforeRename(path) { writes.push(path); } } });
  storage.setItem('', state([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]));
  const first = JSON.parse(await readFile(storage.indexPath, 'utf8'));
  writes.length = 0;
  storage.setItem('', state([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]));
  assert.deepEqual(writes, []);
  storage.setItem('', state([{ id: 'a', n: 2 }, { id: 'b', n: 1 }], 2));
  assert.equal(writes.length, 2);
  const second = JSON.parse(await readFile(storage.indexPath, 'utf8'));
  assert.equal(second.teams[1].file, first.teams[1].file);
  assert.notEqual(second.teams[0].file, first.teams[0].file);
});

test('stream journal recovers deltas, compacts every minute and skips committed log records', async t => {
  const { appendFile, stat } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'wework-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let clock = 0, failReset = false;
  const storage = new TeamPartitionedWeWorkStorage(root, { now: () => clock, hooks: { beforeRename(path) {
    if (failReset && path.endsWith('.journal')) throw new Error('reset interrupted');
  } } });
  const content = 'x'.repeat(100000);
  storage.setItem('', state([{ id: 'a', text: content }], 1));
  const originalIndex = await readFile(storage.indexPath, 'utf8');
  for (let i = 2; i <= 10; i++) storage.setItem('', state([{ id: 'a', text: content + '!'.repeat(i) }], i), 'stream');
  assert.equal(await readFile(storage.indexPath, 'utf8'), originalIndex);
  assert.ok((await stat(storage.journalPath)).size < 10000, 'journal contains deltas, not full historical text');
  const restart = new TeamPartitionedWeWorkStorage(root);
  assert.equal(JSON.parse(restart.getItem()).teams[0].text, content + '!'.repeat(10));
  await appendFile(storage.journalPath, '{"partial":');
  assert.equal(JSON.parse(restart.getItem()).eventCursor, 10);
  storage.setItem('', state([{ id: 'a', text: content + 'recovered' }], 11), 'stream');
  assert.equal(JSON.parse(new TeamPartitionedWeWorkStorage(root).getItem()).eventCursor, 11);
  clock = 60000; failReset = true;
  storage.setItem('', state([{ id: 'a', text: 'compacted' }], 12), 'stream');
  assert.notEqual(await readFile(storage.indexPath, 'utf8'), originalIndex);
  assert.equal(JSON.parse(new TeamPartitionedWeWorkStorage(root).getItem()).teams[0].text, 'compacted');
  storage.setItem('', state([{ id: 'a', text: 'compacted tail' }], 13), 'stream');
  assert.equal(JSON.parse(new TeamPartitionedWeWorkStorage(root).getItem()).teams[0].text, 'compacted tail');
  failReset = false;
  storage.setItem('', state([{ id: 'a', text: 'final' }], 14));
  assert.equal(await readFile(storage.journalPath, 'utf8'), '');
  assert.equal(JSON.parse(new TeamPartitionedWeWorkStorage(root).getItem()).teams[0].text, 'final');
});

test('real runtime event API uses journal until a terminal activity is saved', async t => {
  const root = await mkdtemp(join(tmpdir(), 'wework-stream-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new TeamPartitionedWeWorkStorage(root);
  const api = createLocalWeWorkApi(storage);
  const team = await api.createTeam({ name: 'Stream', runtime: 'Workspace' });
  const employee = await api.addEmployee(team.id, { displayName: 'Writer', roleName: 'Writer', runtime: 'Workspace', skills: [] });
  const before = await readFile(storage.indexPath, 'utf8');
  for (let sequence = 1; sequence <= 5; sequence++) {
    await api.appendRuntimeEvents(employee.id, employee.activeSession.id, 'run', [{ sequence, type: 'assistant.delta', text: 'hello' }]);
    await api.snapshot();
    assert.equal(await readFile(storage.indexPath, 'utf8'), before);
  }
  const restored = createLocalWeWorkApi(new TeamPartitionedWeWorkStorage(root));
  const restoredEmployee = (await restored.snapshot()).teams[0].employees.find(item => item.id === employee.id);
  assert.equal(restoredEmployee.activeSession.messages.at(-1).text, 'hello'.repeat(5));
  await restored.setEmployeeActivity(employee.id, 'idle', 'complete');
  assert.equal(await readFile(storage.journalPath, 'utf8'), '');
});

test('complete corrupted journal records fail closed', async t => {
  const root = await mkdtemp(join(tmpdir(), 'wework-journal-corrupt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new TeamPartitionedWeWorkStorage(root);
  storage.setItem('', state([{ id: 'a', text: 'base' }], 1));
  storage.setItem('', state([{ id: 'a', text: 'base tail' }], 2), 'stream');
  const original = await readFile(storage.journalPath, 'utf8');
  await writeFile(storage.journalPath, original.replace(' tail', ' damaged'));
  assert.throws(() => new TeamPartitionedWeWorkStorage(root).getItem(), /checksum mismatch/);
});
