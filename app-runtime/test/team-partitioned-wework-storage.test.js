import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeamPartitionedWeWorkStorage, safeTeamDirectory } from '../src/host/team-partitioned-wework-storage.js';

const state = (teams, cursor = 1) => JSON.stringify({ teams, runtimeProfiles: [], eventCursor: cursor });

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
