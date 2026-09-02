import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { migrateLegacySmalldashSession } from '../src/host/legacy-session-migration.js';

test('a corrupt packaged Session fails closed instead of importing an older home fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-native-session-migration-'));
  const packagedRoot = join(root, 'Documents', 'WeWork');
  const homeRoot = join(root, '.wework');
  const targetRoot = join(root, 'Documents', '.wework', 'runtime-data');
  const quarantineRoot = join(root, 'Documents', '.wework', 'migration-quarantine');
  const sessionId = 'native-session-1';
  const packagedPath = join(packagedRoot, 'smalldash', 'sessions', `${sessionId}.json`);
  const homePath = join(homeRoot, 'smalldash', 'sessions', `${sessionId}.json`);
  await mkdir(join(packagedPath, '..'), { recursive: true });
  await mkdir(join(homePath, '..'), { recursive: true });
  await writeFile(packagedPath, '{ damaged packaged Session');
  await writeFile(homePath, JSON.stringify({ id: sessionId, messages: [{ role: 'assistant', content: 'stale home history' }] }));

  assert.equal(await migrateLegacySmalldashSession({ sessionId, legacyDataRoots: [packagedRoot, homeRoot], targetDataRoot: targetRoot, quarantineRoot }), false);
  await assert.rejects(access(join(targetRoot, 'smalldash', 'sessions', `${sessionId}.json`)), (error) => error.code === 'ENOENT');
  assert.equal(await readFile(packagedPath, 'utf8'), '{ damaged packaged Session');
  assert.ok((await readdir(quarantineRoot)).some((name) => name.endsWith('.json')));
});

test('a packaged Session with unreadable message entries is quarantined before copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-native-session-message-'));
  const packagedRoot = join(root, 'Documents', 'WeWork');
  const targetRoot = join(root, 'Documents', '.wework', 'runtime-data');
  const quarantineRoot = join(root, 'Documents', '.wework', 'migration-quarantine');
  const sessionId = 'native-session-2';
  const packagedPath = join(packagedRoot, 'smalldash', 'sessions', `${sessionId}.json`);
  await mkdir(join(packagedPath, '..'), { recursive: true });
  await writeFile(packagedPath, JSON.stringify({ id: sessionId, messages: [null] }));

  assert.equal(await migrateLegacySmalldashSession({ sessionId, legacyDataRoots: [packagedRoot], targetDataRoot: targetRoot, quarantineRoot }), false);
  await assert.rejects(access(join(targetRoot, 'smalldash', 'sessions', `${sessionId}.json`)), (error) => error.code === 'ENOENT');
  assert.ok((await readdir(quarantineRoot)).some((name) => name.endsWith('.json')));
});
