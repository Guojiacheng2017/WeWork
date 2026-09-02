import { expect, it } from 'vitest';
import * as workspaceDraft from './workspaceDraft';

const { shouldResetWorkspaceDraft } = workspaceDraft;

it('preserves a dirty workspace draft across unrelated hydration', () => {
  expect(shouldResetWorkspaceDraft({ previousTeamId: 'team', teamId: 'team', baseline: 'saved-a', persisted: 'saved-b', draft: 'local-draft' })).toBe(false);
});

it('creates a blank SSH draft when switching from an SSH team to another team', () => {
  expect((workspaceDraft as any).sshDraftForAssignment(undefined)).toEqual({ kind: 'ssh', host: '', port: 22, username: '', rootPath: '', credentialRef: '' });
  expect((workspaceDraft as any).sshWorkspaceExecutionSupported).toBe(false);
});

it('records catalog selection separately from legacy Runtime Profile provenance', () => {
  const execution = { id: 'session', name: 'Session', adapter: 'smalldash', model: { provider: 'openai', modelId: 'old' }, systemPrompt: '', thinkingLevel: 'off', enabled: true, sourceProfileId: 'runtime:legacy', profileRevision: 1 };
  const selected = (workspaceDraft as any).executionWithCatalogModel(execution, { id: 'catalog:model-1', harness: 'smalldashharness', provider: 'openai', modelId: 'new', api: 'openai-completions', baseUrl: 'https://models.example/v1', credentialRef: 'keychain:model/key-1' });
  expect(selected.sourceProfileId).toBe('runtime:legacy');
  expect(selected.modelCatalogId).toBe('catalog:model-1');
  expect(selected.model.modelId).toBe('new');
});

it('creates a new employee Session with the complete env-backed catalog connection', () => {
  const execution = (workspaceDraft as any).createExecutionForCatalogModel({ id: 'catalog:env-model', harness: 'smalldashharness', provider: 'openai', modelId: 'qwen', api: 'openai-completions', baseUrl: 'http://127.0.0.1:8000/v1', apiKeyEnv: 'LOCAL_MODEL_API_KEY' }, 'employee-execution-1');
  expect(execution.modelCatalogId).toBe('catalog:env-model');
  expect(execution.model.apiKeyEnv).toBe('LOCAL_MODEL_API_KEY');
});

it('migrates a legacy non-default catalog selection out of Runtime Profile provenance', () => {
  const execution = { id: 'session', name: 'Session', adapter: 'smalldash', model: { provider: 'openai', modelId: 'selected', api: 'openai-completions', baseUrl: 'https://selected.example/v1', credentialRef: 'keychain:model/selected' }, systemPrompt: '', thinkingLevel: 'off', enabled: true, sourceProfileId: 'catalog:selected', profileRevision: 1 };
  const models = [
    { id: 'catalog:default', harness: 'smalldashharness', provider: 'openai', modelId: 'default', verified: true },
    { id: 'catalog:selected', harness: 'smalldashharness', provider: 'openai', modelId: 'selected', api: 'openai-completions', baseUrl: 'https://selected.example/v1', credentialRef: 'keychain:model/selected', verified: true },
  ];

  const migrated = (workspaceDraft as any).migrateLegacyCatalogSelection(execution, models);
  expect(migrated.modelCatalogId).toBe('catalog:selected');
  expect(migrated.sourceProfileId).toBeUndefined();
  expect(migrated.model.modelId).toBe('selected');
});

it('accepts an external workspace update when the form is pristine and resets for another team', () => {
  expect(shouldResetWorkspaceDraft({ previousTeamId: 'team', teamId: 'team', baseline: 'saved-a', persisted: 'saved-b', draft: 'saved-a' })).toBe(true);
  expect(shouldResetWorkspaceDraft({ previousTeamId: 'team-a', teamId: 'team-b', baseline: 'saved-a', persisted: 'saved-b', draft: 'local-draft' })).toBe(true);
});
