import test from 'node:test';
import assert from 'node:assert/strict';
import { HarnessDetector } from '../src/host/harness-detector.js';
import { executeHarness } from '../src/harness-dispatch.js';
import { SdhConnectionStore } from '../src/host/sdh-connection.js';

test('unsupported adapters are not probed or advertised', async () => {
  const detector = new HarnessDetector({ platform: 'linux', run: async () => { throw new Error('missing'); }, bundledSdh: async () => { throw new Error('must not probe'); } });
  assert.equal((await detector.detect()).some(row => row.harness === 'smalldashharness'), false);
});
test('unsupported execution and configuration are rejected', async () => {
  await assert.rejects(executeHarness({ runtimeProfile: { adapter: 'smalldash' } }, {}), { code: 'HARNESS_ADAPTER_UNAVAILABLE' });
  const store = new SdhConnectionStore('/not-used');
  assert.deepEqual(await store.get(), { baseUrl: '', configured: false });
  await assert.rejects(store.set({ baseUrl: 'http://127.0.0.1:9999' }), { code: 'HARNESS_ADAPTER_UNAVAILABLE' });
});
