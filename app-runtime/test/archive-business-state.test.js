import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveBusinessState } from '../src/host/archive-business-state.js';
import { TeamPartitionedWeWorkStorage } from '../src/host/team-partitioned-wework-storage.js';

test('archives business state and workspaces while leaving the active store empty', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-business-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const weworkRoot = join(root, 'WeWork');
  const configRoot = join(root, '.wework');
  const storage = new TeamPartitionedWeWorkStorage(weworkRoot, {
    indexPath: join(configRoot, 'wework-index.json'),
    teamPath: (teamId, file) => join(weworkRoot, teamId, '.wework-state', file),
  });
  storage.setItem('', JSON.stringify({ teams: [{ id: 'team-a', name: 'Demo' }], runtimeProfiles: [{ id: 'old-profile' }], eventCursor: 9 }));
  await mkdir(join(weworkRoot, 'team-a', 'artifacts'), { recursive: true });
  await writeFile(join(weworkRoot, 'team-a', 'artifacts', 'report.md'), 'legacy output');

  const result = archiveBusinessState({ storage, weworkRoot, archiveRoot: join(configRoot, 'legacy-demo'), now: () => new Date('2026-09-04T06:00:00.000Z') });

  assert.equal(result.archived, true);
  assert.equal(result.teamCount, 1);
  assert.deepEqual(JSON.parse(storage.getItem()).teams, []);
  assert.deepEqual(JSON.parse(storage.getItem()).runtimeProfiles, []);
  assert.equal(await readFile(join(result.destination, 'teams', 'team-a', 'artifacts', 'report.md'), 'utf8'), 'legacy output');
  assert.equal(JSON.parse(await readFile(join(result.destination, 'business-snapshot.json'), 'utf8')).teams[0].name, 'Demo');
});

test('does nothing when the active business store is already empty', () => {
  const storage = { getItem: () => null, setItem: () => assert.fail('must not write') };
  assert.deepEqual(archiveBusinessState({ storage, weworkRoot: '/unused', archiveRoot: '/unused' }), { archived: false, teamCount: 0 });
});
