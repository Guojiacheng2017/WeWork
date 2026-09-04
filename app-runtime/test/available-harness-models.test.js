import assert from 'node:assert/strict';
import test from 'node:test';
import { listAvailableHarnessModels } from '../src/host/available-harness-models.js';

const piModel = { id: 'pi:anthropic:sonnet', harness: 'pi', provider: 'anthropic', modelId: 'sonnet' };

test('merges Pi-owned and remote SDH model catalogs', async () => {
  const result = await listAvailableHarnessModels({
    detector: { detect: async () => [{ harness: 'pi', executionReady: true, executablePath: '/opt/pi' }] },
    discoverPi: async (path) => { assert.equal(path, '/opt/pi'); return { models: [piModel], defaults: { pi: piModel.id } }; },
    sdh: { models: async () => ({ models: [{ id: 'sdh:model', modelId: 'remote', baseUrl: 'http://internal' }], defaultId: 'sdh:model' }) },
  });
  assert.deepEqual(result.models.map((model) => model.harness), ['pi', 'smalldashharness']);
  assert.deepEqual(result.defaults, { pi: piModel.id, smalldashharness: 'sdh:model' });
  assert.equal(result.models[1].baseUrl, undefined);
});

test('keeps Pi models available when optional SDH is not configured', async () => {
  const result = await listAvailableHarnessModels({
    detector: { detect: async () => [{ harness: 'pi', executionReady: true, executablePath: '/opt/pi' }] },
    discoverPi: async () => ({ models: [piModel], defaults: { pi: piModel.id } }),
    sdh: { models: async () => { throw new Error('SDH unavailable'); } },
  });
  assert.deepEqual(result, { models: [piModel], defaults: { pi: piModel.id } });
});

test('keeps SDH models available when Pi discovery fails or Pi is absent', async () => {
  const result = await listAvailableHarnessModels({
    detector: { detect: async () => [{ harness: 'pi', executionReady: true, executablePath: '/opt/pi' }] },
    discoverPi: async () => { throw new Error('Pi not authenticated'); },
    sdh: { models: async () => ({ models: [{ id: 'sdh:model', modelId: 'remote' }], defaultId: 'sdh:model' }) },
  });
  assert.deepEqual(result.models.map((model) => model.harness), ['smalldashharness']);
});
