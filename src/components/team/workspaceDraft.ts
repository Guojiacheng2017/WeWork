import type { SessionExecution, WorkspaceAssignment } from '../../domain/wework';
import type { HarnessModel } from '../../runtime/weworkHost';

export const sshWorkspaceExecutionSupported = false;

export function sshDraftForAssignment(assignment?: WorkspaceAssignment): Extract<WorkspaceAssignment, { kind: 'ssh' }> {
  return assignment?.kind === 'ssh'
    ? assignment
    : { kind: 'ssh', host: '', port: 22, username: '', rootPath: '', credentialRef: '' };
}

export function executionWithCatalogModel(current: SessionExecution, model: HarnessModel): SessionExecution {
  return {
    ...current,
    adapter: model.harness === 'smalldashharness' ? 'smalldash' : model.harness,
    modelCatalogId: model.id,
    model: model.harness === 'smalldashharness'
      ? { provider: model.provider, modelId: model.modelId, api: model.api, baseUrl: model.baseUrl, credentialRef: model.credentialRef, apiKeyEnv: model.apiKeyEnv }
      : { provider: model.provider, modelId: model.modelId },
  };
}

export function createExecutionForCatalogModel(model: HarnessModel, id = `employee-execution-${crypto.randomUUID()}`): SessionExecution {
  return executionWithCatalogModel({
    id, name: `${model.harness} Session`, adapter: model.harness === 'smalldashharness' ? 'smalldash' : model.harness,
    model: { provider: model.provider, modelId: model.modelId }, systemPrompt: '', thinkingLevel: 'off', enabled: true, profileRevision: 1,
  }, model);
}

export function migrateLegacyCatalogSelection(current: SessionExecution, models: Array<Pick<HarnessModel, 'id' | 'harness' | 'provider' | 'modelId' | 'api' | 'baseUrl' | 'credentialRef' | 'apiKeyEnv' | 'verified'>>): SessionExecution {
  if (current.modelCatalogId || !current.sourceProfileId) return current;
  const harness = current.adapter === 'smalldash' ? 'smalldashharness' : current.adapter;
  const match = models.find((model) => model.verified && model.id === current.sourceProfileId && model.harness === harness);
  const connectionFields = ['provider', 'modelId', 'api', 'baseUrl', 'credentialRef', 'apiKeyEnv'] as const;
  if (!match || connectionFields.some((key) => current.model[key] !== match[key])) return current;
  const { sourceProfileId: _legacyCatalogId, ...execution } = current;
  return { ...execution, modelCatalogId: match.id };
}

export function shouldResetWorkspaceDraft(input: {
  previousTeamId: string;
  teamId: string;
  baseline: string;
  persisted: string;
  draft: string;
}) {
  return input.previousTeamId !== input.teamId || (input.persisted !== input.baseline && input.draft === input.baseline);
}
