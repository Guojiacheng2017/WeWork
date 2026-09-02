import { HostError } from './errors.js';

export const MODEL_API_KEY_ENV_NAMES = Object.freeze([
  'WEWORK_MODEL_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'LOCAL_MODEL_API_KEY',
]);

const allowedEnvironmentNames = new Set(MODEL_API_KEY_ENV_NAMES);

export function isAllowedModelApiKeyEnvironment(name) {
  return typeof name === 'string' && allowedEnvironmentNames.has(name);
}

const missing = () => new HostError('CREDENTIAL_MISSING', 'model credential reference is missing, unauthorized, or unavailable', 409);

export async function resolveAuthorizedModelApiKey(vault, model = {}, { environment = process.env } = {}) {
  if (model.credentialRef && model.apiKeyEnv) throw missing();
  if (model.credentialRef) {
    let metadata;
    try { metadata = (await vault.listCredentials()).find((item) => item.ref === model.credentialRef); }
    catch { throw missing(); }
    if (metadata?.kind !== 'model-api-key') throw missing();
    try {
      const secret = await vault.resolveCredential(model.credentialRef);
      if (typeof secret !== 'string' || !secret) throw missing();
      return secret;
    } catch { throw missing(); }
  }
  if (model.apiKeyEnv) {
    if (!isAllowedModelApiKeyEnvironment(model.apiKeyEnv)) throw missing();
    const secret = environment?.[model.apiKeyEnv];
    if (typeof secret !== 'string' || !secret) throw missing();
    return secret;
  }
  return undefined;
}
