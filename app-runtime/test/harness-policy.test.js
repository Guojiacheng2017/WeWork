import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessPolicyStore } from '../src/host/harness-policy.js';

test('harness allowance is persisted atomically on the device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-harness-policy-'));
  const path = join(root, 'harness-policy.json');
  const store = new HarnessPolicyStore(path);
  assert.deepEqual(await store.get(), { allowedHarnesses: ['smalldashharness'] });
  await store.set(['pi', 'codex-cli', 'smalldashharness', 'unknown']);
  assert.deepEqual(await store.get(), { allowedHarnesses: ['smalldashharness'] });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { allowedHarnesses: ['smalldashharness'] });
  await store.set([]);
  assert.deepEqual(await store.get(),{allowedHarnesses:[]});
});
