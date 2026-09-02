import { describe, expect, it } from 'vitest';
import { normalizeModelConfiguration, normalizeSessionExecution } from './wework';

describe('model configuration parity and Session model provenance', () => {
  it('accepts shared lower bounds, hierarchical refs, and explicitly allowlisted model-key environments', () => {
    expect(normalizeModelConfiguration({ provider: 'openai', modelId: 'gpt', contextWindow: 1024, maxTokens: 1, credentialRef: 'keychain:team/model/key-1' })).toMatchObject({ contextWindow: 1024, maxTokens: 1, credentialRef: 'keychain:team/model/key-1' });
    expect(normalizeModelConfiguration({ provider: 'openai', modelId: 'gpt', apiKeyEnv: 'LOCAL_MODEL_API_KEY' })).toMatchObject({ apiKeyEnv: 'LOCAL_MODEL_API_KEY' });
  });

  it('rejects local limits and environment names that the remote/Host boundary cannot accept safely', () => {
    expect(() => normalizeModelConfiguration({ provider: 'openai', modelId: 'gpt', contextWindow: 1023 })).toThrow();
    for (const apiKeyEnv of ['WEWORK_HOST_TOKEN', 'RANDOM_SECRET']) expect(() => normalizeModelConfiguration({ provider: 'openai', modelId: 'gpt', apiKeyEnv })).toThrow();
    expect(() => normalizeModelConfiguration({ provider: 'openai', modelId: 'gpt', credentialRef: 'vault:model', apiKeyEnv: 'WEWORK_MODEL_API_KEY' })).toThrow();
  });

  it('keeps runtime-profile provenance separate from the selected model-catalog record', () => {
    const execution = normalizeSessionExecution({ id: 'session', name: 'Session', adapter: 'smalldash', model: { provider: 'openai', modelId: 'qwen' }, systemPrompt: '', thinkingLevel: 'off', enabled: true, sourceProfileId: 'runtime:legacy', modelCatalogId: 'catalog:model-1', profileRevision: 2 });
    expect(execution.sourceProfileId).toBe('runtime:legacy');
    expect(execution.modelCatalogId).toBe('catalog:model-1');
  });
});
