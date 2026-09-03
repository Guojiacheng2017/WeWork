import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HarnessModelCatalog } from '../src/host/harness-model-catalog.js';

test('catalog persists available models per Harness and maintains one default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  const catalog = new HarnessModelCatalog(path);

  const first = await catalog.save({ harness: 'smalldashharness', name: 'Local Qwen', provider: 'openai', modelId: 'qwen3', baseUrl: 'http://127.0.0.1:8000/v1', verified: true }, { verifiedByHost: true });
  const second = await catalog.save({ harness: 'smalldashharness', name: 'Local Llama', provider: 'openai', modelId: 'llama3', baseUrl: 'http://127.0.0.1:8000/v1', verified: true }, { verifiedByHost: true });
  await catalog.setDefault('smalldashharness', second.id);

  const result = await new HarnessModelCatalog(path).list();
  assert.equal(result.models.length, 2);
  assert.equal(result.defaults.smalldashharness, second.id);
  assert.equal(result.models.find((item) => item.id === first.id).isDefault, false);
  assert.equal(result.models.find((item) => item.id === second.id).isDefault, true);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).defaults.smalldashharness, second.id);
});

test('concurrent catalog saves serialize without losing either verified model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  const catalog = new HarnessModelCatalog(path);

  const [first, second] = await Promise.all([
    catalog.save({ harness: 'smalldashharness', name: 'Concurrent A', provider: 'openai', modelId: 'a' }, { verifiedByHost: true }),
    catalog.save({ harness: 'smalldashharness', name: 'Concurrent B', provider: 'openai', modelId: 'b' }, { verifiedByHost: true }),
  ]);

  const result = await new HarnessModelCatalog(path).list();
  assert.deepEqual(new Set(result.models.map((model) => model.id)), new Set([first.id, second.id]));
  assert.ok(result.models.some((model) => model.isDefault && model.verified));
});

test('catalog rejects connections and defaults for Harness-managed models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const catalog = new HarnessModelCatalog(join(root, 'harness-models.json'));
  await assert.rejects(catalog.save({ harness: 'pi', name: 'Pi model', provider: 'anthropic', modelId: 'claude', verified: true }), (error) => error.code === 'MODEL_CONNECTION_HARNESS_MANAGED');
  await assert.rejects(catalog.setDefault('pi', 'pi:anthropic:claude'), (error) => error.code === 'MODEL_CONNECTION_HARNESS_MANAGED');
});

test('unverified models cannot become a Harness default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const catalog = new HarnessModelCatalog(join(root, 'harness-models.json'));
  const model = await catalog.save({ harness: 'smalldashharness', name: 'Unchecked', provider: 'openai', modelId: 'unknown', verified: false });
  await assert.rejects(catalog.setDefault('smalldashharness', model.id), (error) => error.code === 'MODEL_NOT_VERIFIED');
});

test('catalog clears a tampered schema-v2 default that points to an unverified model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  const timestamp = '2026-01-01T00:00:00.000Z';
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify({
    schemaVersion: 2,
    models: [{ id: 'unchecked', harness: 'smalldashharness', name: 'Unchecked', provider: 'openai', modelId: 'unchecked', verified: false, createdAt: timestamp, updatedAt: timestamp }],
    defaults: { smalldashharness: 'unchecked' },
  })));

  const result = await new HarnessModelCatalog(path).list();
  assert.deepEqual(result.defaults, {});
  assert.equal(result.models[0].isDefault, false);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).defaults, {});
});

test('demoting the current default clears it until a verified model is selected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  const catalog = new HarnessModelCatalog(path);
  const verified = await catalog.save({ harness: 'smalldashharness', name: 'Verified', provider: 'openai', modelId: 'verified' }, { verifiedByHost: true });

  const demoted = await catalog.save({ id: verified.id, harness: 'smalldashharness', name: 'Verified', provider: 'openai', modelId: 'verified' });

  assert.equal(demoted.verified, false);
  assert.equal(demoted.isDefault, false);
  assert.deepEqual((await catalog.list()).defaults, {});
});

test('catalog never trusts a Renderer supplied verified flag without Host evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const catalog = new HarnessModelCatalog(join(root, 'harness-models.json'));
  const claimed = await catalog.save({ harness: 'smalldashharness', name: 'Claimed', provider: 'openai', modelId: 'claimed', baseUrl: 'https://models.example/v1', verified: true });

  assert.equal(claimed.verified, false);
  await assert.rejects(catalog.setDefault('smalldashharness', claimed.id), (error) => error.code === 'MODEL_NOT_VERIFIED');
});

test('catalog rejects ambiguous credential sources before persistence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const catalog = new HarnessModelCatalog(join(root, 'harness-models.json'));
  await assert.rejects(catalog.save({ harness: 'smalldashharness', name: 'Ambiguous', provider: 'openai', modelId: 'x', baseUrl: 'https://models.example/v1', credentialRef: 'vault:model', apiKeyEnv: 'WEWORK_MODEL_API_KEY', verified: false }), (error) => error.code === 'MODEL_INVALID');
});

test('smalldash OpenAI-compatible catalog accepts only no-credential connections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const catalog = new HarnessModelCatalog(join(root, 'harness-models.json'));
  for (const credential of [{ credentialRef: 'vault:model' }, { apiKeyEnv: 'WEWORK_MODEL_API_KEY' }]) {
    await assert.rejects(catalog.save({ harness: 'smalldashharness', name: 'Authenticated', provider: 'openai', modelId: 'x', baseUrl: 'https://models.example/v1', ...credential }), (error) => error.code === 'MODEL_INVALID');
  }
});

test('legacy Renderer-verifiable catalogs are quarantined and demoted until the Host re-probes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-')); const path = join(root, 'harness-models.json');
  const legacy = { schemaVersion: 1, models: [{ id: 'legacy-claim', harness: 'smalldashharness', name: 'Legacy claim', provider: 'openai', modelId: 'x', baseUrl: 'https://models.example/v1', verified: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }], defaults: { smalldashharness: 'legacy-claim' } };
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify(legacy)));

  const result = await new HarnessModelCatalog(path).list();
  assert.equal(result.models[0].verified, false);
  assert.deepEqual(result.defaults, {});
  assert.equal(JSON.parse(await readFile(path, 'utf8')).schemaVersion, 2);
  const quarantine = (await readdir(root)).find((name) => name.startsWith('harness-models.json.quarantine.'));
  assert.match(await readFile(join(root, quarantine), 'utf8'), /"verified":true/);
});

test('catalog rejects raw model secrets and excludes poisoned persisted models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  const catalog = new HarnessModelCatalog(path);
  await assert.rejects(catalog.save({ harness: 'smalldashharness', name: 'Unsafe', provider: 'openai', modelId: 'x', baseUrl: 'https://models.example/v1', apiKey: 'sk-live-secret', verified: true }), (error) => error.code === 'MODEL_INVALID');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify({ schemaVersion: 1, models: [{ id: 'unsafe', harness: 'smalldashharness', name: 'Unsafe', provider: 'openai', modelId: 'x', baseUrl: 'https://models.example/v1', apiKey: 'sk-live-secret', verified: true }], defaults: { smalldashharness: 'unsafe' } })));
  assert.deepEqual(await catalog.list(), { models: [], defaults: {} });
  assert.doesNotMatch(await readFile(path, 'utf8'), /sk-live-secret/);
  const quarantine = (await readdir(root)).find((name) => name.startsWith('harness-models.json.quarantine.'));
  assert.ok(quarantine, 'the original poisoned catalog should be quarantined');
  assert.match(await readFile(join(root, quarantine), 'utf8'), /sk-live-secret/);
});

test('legacy external connection records are never returned', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-model-catalog-'));
  const path = join(root, 'harness-models.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify({ schemaVersion: 1, models: [{ id: 'legacy', harness: 'pi', name: 'Old', provider: 'x', modelId: 'y', baseUrl: 'https://secret.invalid', credentialRef: 'vault:secret' }], defaults: { pi: 'legacy' } })));
  assert.deepEqual(await new HarnessModelCatalog(path).list(), { models: [], defaults: {} });
});
