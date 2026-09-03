import { HostError } from "./errors.js";
import { normalizeHarnessModelInput } from './harness-model-catalog.js';
import { resolveAuthorizedModelApiKey } from './model-credential-policy.js';

export function withVaultCredential(vault, execute, credentialOptions = {}) {
  return async (spec, options) => {
    if (spec.runtimeProfile?.adapter === 'smalldash') {
      if (spec.runtimeProfile.model?.credentialRef || spec.runtimeProfile.model?.apiKeyEnv) {
        throw new HostError('MODEL_INVALID', 'smalldashharness OpenAI-compatible endpoints must use no credential', 409);
      }
      return execute(spec, { ...options, apiKey: undefined });
    }
    let apiKey;
    try { apiKey = await resolveAuthorizedModelApiKey(vault, spec.runtimeProfile?.model, credentialOptions); }
    catch (error) { if (error instanceof HostError) throw error; throw new HostError("CREDENTIAL_MISSING", "model credential reference not found", 409); }
    return execute(spec, { ...options, apiKey });
  };
}

export function createHarnessModelProbe({ detectHarnesses, fetch: fetchImpl = globalThis.fetch }) {
  return async (input) => {
    const installation = (await detectHarnesses()).find((item) => item.harness === input?.harness);
    if (!installation?.executionReady) return { ok: false, error: 'Harness 尚未执行就绪' };
    if (input?.harness !== 'smalldashharness') return { ok: false, error: '该 Harness 自己管理登录、模型目录和默认模型' };
    try {
      const model = normalizeHarnessModelInput(input);
      const endpoint = new URL(model.baseUrl);
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/models`;
      const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return { ok: false, error: `模型端点返回 HTTP ${response.status}` };
      const payload = await response.json();
      const modelIds = Array.isArray(payload.data) ? payload.data.map((item) => item?.id).filter(Boolean) : [];
      return model.modelId && !modelIds.includes(model.modelId) ? { ok: false, modelIds, error: '端点未返回该模型' } : { ok: true, modelIds };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  };
}

export function createHarnessModelSaver({ catalog, probe }) {
  return async (input) => {
    let verifiedByHost = false;
    if (input?.verified === true) {
      const verification = await probe(input);
      if (!verification?.ok) throw new HostError('MODEL_NOT_VERIFIED', verification?.error ?? 'Host model verification failed', 409);
      verifiedByHost = true;
    }
    return catalog.save(input, { verifiedByHost });
  };
}
