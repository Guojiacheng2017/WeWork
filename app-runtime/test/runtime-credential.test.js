import assert from "node:assert/strict";
import test from "node:test";
import * as runtimeCredentials from "../src/host/runtime-execute.js";

const { withVaultCredential } = runtimeCredentials;

test("model key is resolved inside host and injected only into one execution", async () => {
  let received;
  const execute = withVaultCredential({ listCredentials: async () => [{ ref: 'vault:model', kind: 'model-api-key' }], resolveCredential: async (ref) => { assert.equal(ref, "vault:model"); return "secret-key"; } }, async (spec, options) => { received = { spec, options }; return { finalText: "ok" }; });
  const spec = { runtimeProfile: { model: { credentialRef: "vault:model" } } };
  await execute(spec, { signal: "signal" });
  assert.equal(received.options.apiKey, "secret-key");
  assert.equal(received.options.signal, "signal");
  assert.doesNotMatch(JSON.stringify(received.spec), /secret-key/);
});

test("missing model credential has a stable host error", async () => {
  const execute = withVaultCredential({ listCredentials: async () => [], resolveCredential: async () => { throw new Error("missing"); } }, async () => assert.fail());
  await assert.rejects(execute({ runtimeProfile: { model: { credentialRef: "vault:missing" } } }, {}), (error) => error.code === "CREDENTIAL_MISSING");
});

test('model execution rejects a Vault reference of the wrong kind before resolving it', async () => {
  let resolved = false;
  const execute = withVaultCredential({
    listCredentials: async () => [{ ref: 'vault:ssh', kind: 'ssh-password' }],
    resolveCredential: async () => { resolved = true; return 'ssh-secret'; },
  }, async () => assert.fail());

  await assert.rejects(execute({ runtimeProfile: { model: { credentialRef: 'vault:ssh' } } }, {}), (error) => error.code === 'CREDENTIAL_MISSING');
  assert.equal(resolved, false);
});

test('model execution accepts only allowlisted model-key environment names', async () => {
  const environment = { WEWORK_MODEL_API_KEY: 'model-secret', WEWORK_HOST_TOKEN: 'host-secret', RANDOM_SECRET: 'random-secret' };
  const vault = { listCredentials: async () => [], resolveCredential: async () => assert.fail() };
  let received;
  const execute = withVaultCredential(vault, async (_spec, options) => { received = options.apiKey; return { finalText: 'ok' }; }, { environment });

  await execute({ runtimeProfile: { model: { apiKeyEnv: 'WEWORK_MODEL_API_KEY' } } }, {});
  assert.equal(received, 'model-secret');
  for (const apiKeyEnv of ['WEWORK_HOST_TOKEN', 'RANDOM_SECRET']) {
    await assert.rejects(execute({ runtimeProfile: { model: { apiKeyEnv } } }, {}), (error) => error.code === 'CREDENTIAL_MISSING');
  }
});

test('smalldash model probing rejects credentials and sends no authorization header', async () => {
  const requests = [];
  const probe = runtimeCredentials.createHarnessModelProbe({
    detectHarnesses: async () => [{ harness: 'smalldashharness', executionReady: true }],
    fetch: async (_url, options) => { requests.push(options); return { ok: true, json: async () => ({ data: [{ id: 'qwen' }] }) }; },
  });
  const input = { harness: 'smalldashharness', name: 'Qwen', provider: 'openai', modelId: 'qwen', baseUrl: 'https://models.example/v1', verified: false };

  assert.equal((await probe({ ...input, credentialRef: 'vault:model' })).ok, false);
  assert.equal(requests.length, 0);
  assert.equal((await probe(input)).ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers, undefined);
});

test('smalldash execution never resolves or forwards a model credential', async () => {
  let executed = false;
  const execute = withVaultCredential({ listCredentials: async () => assert.fail(), resolveCredential: async () => assert.fail() }, async (_spec, options) => { executed = true; assert.equal(options.apiKey, undefined); return { finalText: 'ok' }; });
  await execute({ runtimeProfile: { adapter: 'smalldash', model: { baseUrl: 'http://127.0.0.1:8000/v1', modelId: 'qwen' } } }, {});
  assert.equal(executed, true);
  await assert.rejects(execute({ runtimeProfile: { adapter: 'smalldash', model: { credentialRef: 'vault:model' } } }, {}), (error) => error.code === 'MODEL_INVALID');
});

test('verified catalog state is issued only after a Host probe succeeds', async () => {
  const saves = [];
  const save = runtimeCredentials.createHarnessModelSaver({
    catalog: { save: async (input, options) => { saves.push({ input, options }); return { ...input, verified: options.verifiedByHost }; } },
    probe: async (input) => input.modelId === 'reachable' ? { ok: true } : { ok: false, error: 'unreachable' },
    vault: { listCredentials: async () => [], resolveCredential: async () => assert.fail() },
  });

  await assert.rejects(save({ harness: 'smalldashharness', name: 'Bad', provider: 'openai', modelId: 'bad', baseUrl: 'https://models.example/v1', verified: true }), (error) => error.code === 'MODEL_NOT_VERIFIED');
  assert.equal(saves.length, 0);
  assert.equal((await save({ harness: 'smalldashharness', name: 'Good', provider: 'openai', modelId: 'reachable', baseUrl: 'https://models.example/v1', verified: true })).verified, true);
  assert.equal(saves[0].options.verifiedByHost, true);
});
