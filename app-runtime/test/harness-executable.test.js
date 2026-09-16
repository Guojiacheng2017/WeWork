import assert from 'node:assert/strict';
import test from 'node:test';
import { harnessExecutableCandidates, resolveHarnessExecutable } from '../src/host/harness-executable.js';

test('shared Harness lookup covers GUI-missing package-manager directories', async () => {
  const candidates = await harnessExecutableCandidates('claude', {
    platform: 'darwin', environment: { PATH: '/usr/bin' }, home: '/Users/worker',
    readDirectory: async () => [{ name: 'v20.1.0', isDirectory: () => true }, { name: 'README', isDirectory: () => false }],
  });
  assert.ok(candidates.includes('/opt/homebrew/bin/claude'));
  assert.ok(candidates.includes('/usr/local/bin/claude'));
  assert.ok(candidates.includes('/Users/worker/.local/bin/claude'));
  assert.ok(candidates.includes('/Users/worker/.volta/bin/claude'));
  assert.ok(candidates.includes('/Users/worker/.nvm/versions/node/v20.1.0/bin/claude'));
});

test('shared Harness resolver returns the first executable candidate', async () => {
  const checked = [];
  const result = await resolveHarnessExecutable('codex', {
    platform: 'darwin', environment: { PATH: '/usr/bin' }, home: '/Users/worker', readDirectory: async () => [],
    accessPath: async (path) => { checked.push(path); if (path !== '/opt/homebrew/bin/codex') throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
  });
  assert.equal(result, '/opt/homebrew/bin/codex');
  assert.ok(checked.includes('/usr/bin/codex'));
});
