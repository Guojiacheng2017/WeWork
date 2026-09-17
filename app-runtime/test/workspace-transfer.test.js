import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportWorkspaceZip, importWorkspaceZip } from '../src/host/workspace-transfer.js';

const memoryStorage = (initial) => {
  let value = JSON.stringify(initial);
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
};

test('exports a portable zip and imports it under the destination WeWork root', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wework-transfer-'));
  const sourceRoot = join(temp, 'source', 'WeWork');
  const targetRoot = join(temp, 'target', 'WeWork');
  const archivePath = join(temp, 'team-backup.zip');
  const team = {
    id: 'team-a', name: 'Vision', pendingWorks: [],
    workspaceAssignment: { kind: 'local', rootPath: join(sourceRoot, 'team-a') },
    employees: [{ id: 'employee-a', displayName: 'Ada', roleName: 'Engineer', workspaceAssignment: { kind: 'local', rootPath: join(sourceRoot, 'team-a', 'employees', 'employee-a') } }],
  };
  const source = memoryStorage({ schemaVersion: 2, teams: [team], runtimeProfiles: [], eventCursor: 4 });
  await mkdir(join(sourceRoot, 'team-a', 'employees', 'employee-a', 'workspace'), { recursive: true });
  await writeFile(join(sourceRoot, 'team-a', 'employees', 'employee-a', 'workspace', 'notes.md'), 'portable');

  const exported = await exportWorkspaceZip({ archivePath, weworkRoot: sourceRoot, storage: source, now: () => new Date('2026-09-16T02:00:00.000Z') });
  assert.equal(exported.teamCount, 1);
  assert.equal((await readFile(archivePath)).subarray(0, 2).toString(), 'PK');

  const target = memoryStorage({ schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 });
  const imported = await importWorkspaceZip({ archivePath, weworkRoot: targetRoot, storage: target });
  assert.equal(imported.teamCount, 1);
  assert.equal(await readFile(join(targetRoot, 'team-a', 'employees', 'employee-a', 'workspace', 'notes.md'), 'utf8'), 'portable');
  const restored = JSON.parse(target.getItem());
  assert.equal(restored.teams[0].workspaceAssignment.rootPath, join(targetRoot, 'team-a'));
  assert.equal(restored.teams[0].employees[0].workspaceAssignment.rootPath, join(targetRoot, 'team-a', 'employees', 'employee-a'));
});

test('does not export secrets and marks external local paths for rebinding', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wework-transfer-'));
  const sourceRoot = join(temp, 'source');
  const archivePath = join(temp, 'backup.zip');
  const source = memoryStorage({ schemaVersion: 2, teams: [{ id: 'team-a', name: 'A', pendingWorks: [], workspaceAssignment: { kind: 'local', rootPath: '/Volumes/private/project' }, employees: [] }], runtimeProfiles: [{ id: 'profile', model: { credentialRef: 'vault:secret' } }], eventCursor: 0 });
  await mkdir(join(sourceRoot, 'team-a'), { recursive: true });
  const result = await exportWorkspaceZip({ archivePath, weworkRoot: sourceRoot, storage: source });
  assert.equal(result.rebindCount, 2);

  const target = memoryStorage({ schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 });
  const imported = await importWorkspaceZip({ archivePath, weworkRoot: join(temp, 'target'), storage: target });
  const restored = JSON.parse(target.getItem());
  assert.equal(restored.teams[0].workspaceAssignment, undefined);
  assert.equal(restored.runtimeProfiles[0].model.credentialRef, undefined);
  assert.equal(imported.rebindCount, 2);
});

test('refuses to overwrite an existing team with the same id', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wework-transfer-'));
  const archivePath = join(temp, 'backup.zip');
  const source = memoryStorage({ schemaVersion: 2, teams: [{ id: 'same', name: 'Source', pendingWorks: [], employees: [] }], runtimeProfiles: [], eventCursor: 0 });
  await mkdir(join(temp, 'source', 'same'), { recursive: true });
  await exportWorkspaceZip({ archivePath, weworkRoot: join(temp, 'source'), storage: source });
  const target = memoryStorage({ schemaVersion: 2, teams: [{ id: 'same', name: 'Target', pendingWorks: [], employees: [] }], runtimeProfiles: [], eventCursor: 0 });
  await assert.rejects(importWorkspaceZip({ archivePath, weworkRoot: join(temp, 'target'), storage: target }), /已存在同 ID 团队/);
});

test('exports only the requested team and its workspace files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'wework-transfer-'));
  const sourceRoot = join(temp, 'source');
  const archivePath = join(temp, 'one-team.zip');
  const teams = ['team-a', 'team-b'].map(id => ({ id, name: id, pendingWorks: [], employees: [] }));
  const source = memoryStorage({ schemaVersion: 2, teams, runtimeProfiles: [], eventCursor: 3 });
  await mkdir(join(sourceRoot, 'team-a'), { recursive: true });
  await mkdir(join(sourceRoot, 'team-b'), { recursive: true });
  await writeFile(join(sourceRoot, 'team-a', 'a.txt'), 'A');
  await writeFile(join(sourceRoot, 'team-b', 'b.txt'), 'B');

  const result = await exportWorkspaceZip({ archivePath, weworkRoot: sourceRoot, storage: source, teamId: 'team-b' });
  assert.equal(result.teamCount, 1);
  const target = memoryStorage({ schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 });
  await importWorkspaceZip({ archivePath, weworkRoot: join(temp, 'target'), storage: target });
  assert.deepEqual(JSON.parse(target.getItem()).teams.map(team => team.id), ['team-b']);
  assert.equal(await readFile(join(temp, 'target', 'team-b', 'b.txt'), 'utf8'), 'B');
  await assert.rejects(readFile(join(temp, 'target', 'team-a', 'a.txt')), /ENOENT/);
});
