import type { CollaborationDelivery, Handoff } from '../local/collaborationState';
import type { WorkRecords } from '../local/workContext';
import type { CollaborationDatabase, TeamModuleRegistry } from './collaboration';

export type SkillRef = {
  id: string;
  name: string;
};

export type ContextMetric = {
  label: string;
  value: number;
  maximum: number;
  unit?: string;
};

export type MessageItem = {
  contextTagIds?: string[];
  sourceRunId?: string;
  senderId?: string;
  recipientId?: string;
  requestRecipientId?: string;
  replyToMessageId?: string;
  deliveryId?: string;
  requestId?: string;
  finalReply?: boolean;
  id: string;
  sender: 'user' | 'employee' | 'system';
  senderName?: string;
  text: string;
  time: string;
};

export type ArtifactItem = {
  id: string;
  name: string;
  type: 'code' | 'doc' | 'model' | 'report' | 'data';
  size: string;
  createdAt: string;
  description?: string;
};

export type WorkItem = {
  cancelledAt?: string;
  id: string;
  title: string;
  goal: string;
  constraints?: string;
  acceptanceCriteria?: string;
  records?: WorkRecords;
  deliveryStatus?: 'submitted' | 'accepted' | 'changes_requested';
  status: 'pending' | 'running' | 'completed' | 'blocked';
  assignedEmployeeId?: string;
  priority: 'low' | 'medium' | 'high';
  category: 'Paperwork' | 'Digital';
  createdAt: string;
  runtimeProfileId?: string;
};

export type RuntimeProfile = {
  id: string;
  name: string;
  adapter: 'pi' | 'claude-code' | 'codex-cli' | 'gemini-cli' | 'smalldash';
  model: { provider: string; modelId: string; api?: 'openai-completions' | 'openai-responses'; baseUrl?: string; credentialRef?: string; apiKeyEnv?: string; contextWindow?: number; maxTokens?: number };
  systemPrompt: string;
  thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionExecution = Omit<RuntimeProfile, 'createdAt' | 'updatedAt'> & {
  /** Legacy profile used to seed this session. It is provenance, not a live lookup. */
  sourceProfileId?: string;
  /** Selected Harness model catalog record. This is not Runtime Profile provenance. */
  modelCatalogId?: string;
  profileRevision: number;
};

export type WorkspaceAssignment =
  | { kind: 'local'; rootPath?: string }
  | { kind: 'ssh'; host: string; port: number; username: string; rootPath: string; credentialRef: string };

export type ResolvedWorkspace =
  | { kind: 'local'; rootPath: string }
  | { kind: 'ssh'; host: string; port: number; username: string; rootPath: string; credentialRef: string };

const invalidWorkspaceAssignment = () => Object.assign(new Error('invalid Workspace assignment'), { code: 'WORKSPACE_ASSIGNMENT_INVALID' });
const isAbsoluteLocalPath = (value: string) => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
const sshHost = /^(?=.{1,253}$)(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)$/;
const sshUsername = /^[A-Za-z_][A-Za-z0-9._-]{0,63}$/;
const opaqueCredentialRef = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7}$/;
const containsControl = (value: string) => /[\x00-\x1f\x7f]/.test(value);
const runtimeAdapters = new Set<RuntimeProfile['adapter']>(['pi', 'claude-code', 'codex-cli', 'gemini-cli', 'smalldash']);
const thinkingLevels = new Set<RuntimeProfile['thinkingLevel']>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
const modelApis = new Set<NonNullable<RuntimeProfile['model']['api']>>(['openai-completions', 'openai-responses']);
const runtimeProfileKeys = new Set(['id', 'name', 'adapter', 'model', 'systemPrompt', 'thinkingLevel', 'enabled', 'createdAt', 'updatedAt']);
const runtimeProfileDraftKeys = new Set(['name', 'adapter', 'model', 'systemPrompt', 'thinkingLevel', 'enabled']);
const sessionExecutionKeys = new Set(['id', 'name', 'adapter', 'model', 'systemPrompt', 'thinkingLevel', 'enabled', 'sourceProfileId', 'modelCatalogId', 'profileRevision']);
const modelKeys = new Set(['provider', 'modelId', 'api', 'baseUrl', 'credentialRef', 'apiKeyEnv', 'contextWindow', 'maxTokens']);
const environmentName = /^[A-Z_][A-Z0-9_]{0,127}$/;
export const MODEL_API_KEY_ENV_NAMES = new Set(['WEWORK_MODEL_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AZURE_OPENAI_API_KEY', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'LOCAL_MODEL_API_KEY']);
const invalidRuntimeProfile = (kind: 'profile' | 'session' = 'profile') => Object.assign(new Error(`invalid ${kind === 'session' ? 'session execution' : 'runtime profile'} config`), { code: kind === 'session' ? 'SESSION_EXECUTION_INVALID' : 'RUNTIME_PROFILE_INVALID' });
const plainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const invalidKeys = (value: Record<string, unknown>, allowed: Set<string>) => Object.keys(value).some((key) => !allowed.has(key));
const requiredText = (value: unknown, maxLength: number, invalid: Error) => {
  if (typeof value !== 'string') throw invalid;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || containsControl(normalized)) throw invalid;
  return normalized;
};

/** Validates the only model settings that may be persisted in WeWork state. */
export function normalizeModelConfiguration(input: unknown, kind: 'profile' | 'session' = 'profile'): RuntimeProfile['model'] {
  const invalid = invalidRuntimeProfile(kind);
  if (!plainRecord(input) || invalidKeys(input, modelKeys)) throw invalid;
  const provider = requiredText(input.provider, 100, invalid);
  const modelId = requiredText(input.modelId, 300, invalid);
  const model: RuntimeProfile['model'] = { provider, modelId };
  if (input.api !== undefined) {
    if (typeof input.api !== 'string' || !modelApis.has(input.api as NonNullable<RuntimeProfile['model']['api']>)) throw invalid;
    model.api = input.api as RuntimeProfile['model']['api'];
  }
  if (input.baseUrl !== undefined) {
    const baseUrl = requiredText(input.baseUrl, 4096, invalid);
    try { const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid; }
    catch { throw invalid; }
    model.baseUrl = baseUrl;
  }
  if (input.credentialRef !== undefined) {
    const credentialRef = requiredText(input.credentialRef, 500, invalid);
    if (!opaqueCredentialRef.test(credentialRef)) throw invalid;
    model.credentialRef = credentialRef;
  }
  if (input.apiKeyEnv !== undefined) {
    if (typeof input.apiKeyEnv !== 'string' || !environmentName.test(input.apiKeyEnv) || !MODEL_API_KEY_ENV_NAMES.has(input.apiKeyEnv)) throw invalid;
    model.apiKeyEnv = input.apiKeyEnv;
  }
  for (const key of ['contextWindow', 'maxTokens'] as const) if (input[key] !== undefined) {
    const minimum = key === 'contextWindow' ? 1024 : 1;
    if (!Number.isSafeInteger(input[key]) || (input[key] as number) < minimum) throw invalid;
    model[key] = input[key] as number;
  }
  if (model.credentialRef && model.apiKeyEnv) throw invalid;
  return model;
}

type RuntimeProfileDraft = Omit<RuntimeProfile, 'id' | 'createdAt' | 'updatedAt'>;
const normalizeRuntimeCore = (input: unknown, kind: 'profile' | 'session', allowMetadata = false) => {
  const invalid = invalidRuntimeProfile(kind);
  const allowed = kind === 'session' ? sessionExecutionKeys : allowMetadata ? runtimeProfileKeys : runtimeProfileDraftKeys;
  if (!plainRecord(input) || invalidKeys(input, allowed)) throw invalid;
  const name = requiredText(input.name, 200, invalid);
  if (typeof input.adapter !== 'string' || !runtimeAdapters.has(input.adapter as RuntimeProfile['adapter'])) throw invalid;
  const systemPrompt = input.systemPrompt ?? '';
  if (typeof systemPrompt !== 'string' || systemPrompt.length > 100000 || /\x00|\x7f/.test(systemPrompt)) throw invalid;
  const thinkingLevel = input.thinkingLevel ?? 'off';
  if (typeof thinkingLevel !== 'string' || !thinkingLevels.has(thinkingLevel as RuntimeProfile['thinkingLevel'])) throw invalid;
  const enabled = input.enabled ?? true;
  if (typeof enabled !== 'boolean') throw invalid;
  const result = { name, adapter: input.adapter as RuntimeProfile['adapter'], model: normalizeModelConfiguration(input.model, kind), systemPrompt, thinkingLevel: thinkingLevel as RuntimeProfile['thinkingLevel'], enabled };
  if (kind === 'profile' && allowMetadata) {
    const id = requiredText(input.id, 200, invalid);
    if (typeof input.createdAt !== 'string' || typeof input.updatedAt !== 'string' || !input.createdAt || !input.updatedAt) throw invalid;
    return { ...result, id, createdAt: input.createdAt, updatedAt: input.updatedAt };
  }
  if (kind === 'session') {
    const id = requiredText(input.id, 200, invalid);
    const profileRevision = input.profileRevision ?? 1;
    if (!Number.isSafeInteger(profileRevision) || (profileRevision as number) < 1) throw invalid;
    const sourceProfileId = input.sourceProfileId === undefined ? undefined : requiredText(input.sourceProfileId, 200, invalid);
    const modelCatalogId = input.modelCatalogId === undefined ? undefined : requiredText(input.modelCatalogId, 200, invalid);
    return { ...result, id, profileRevision: profileRevision as number, ...(sourceProfileId ? { sourceProfileId } : {}), ...(modelCatalogId ? { modelCatalogId } : {}) };
  }
  return result;
};

export function normalizeRuntimeProfileDraft(input: unknown): RuntimeProfileDraft {
  return normalizeRuntimeCore(input, 'profile') as RuntimeProfileDraft;
}

/** Validates profiles from local/Host imports and persisted snapshot reads. */
export function normalizeRuntimeProfile(input: unknown): RuntimeProfile {
  return normalizeRuntimeCore(input, 'profile', true) as RuntimeProfile;
}

/** Validates employee-owned Session execution state, including legacy revision 1. */
export function normalizeSessionExecution(input: unknown): SessionExecution {
  return normalizeRuntimeCore(input, 'session') as SessionExecution;
}

/** Validates persisted workspace metadata. Secret material is never accepted here. */
export function normalizeWorkspaceAssignment(input: unknown): WorkspaceAssignment | undefined {
  if (input === undefined || input === null) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidWorkspaceAssignment();
  const value = input as Record<string, unknown>;
  if (value.kind === 'local') {
    if (Object.keys(value).some((key) => !['kind', 'rootPath'].includes(key))) throw invalidWorkspaceAssignment();
    if (value.rootPath === undefined) return { kind: 'local' };
    if (typeof value.rootPath !== 'string') throw invalidWorkspaceAssignment();
    const rootPath = value.rootPath.trim();
    if (!rootPath || rootPath.length > 4096 || !isAbsoluteLocalPath(rootPath)) throw invalidWorkspaceAssignment();
    return { kind: 'local', rootPath };
  }
  if (value.kind === 'ssh') {
    if (Object.keys(value).some((key) => !['kind', 'host', 'port', 'username', 'rootPath', 'credentialRef'].includes(key))) throw invalidWorkspaceAssignment();
    const host = typeof value.host === 'string' ? value.host.trim() : '';
    const username = typeof value.username === 'string' ? value.username.trim() : '';
    const rootPath = typeof value.rootPath === 'string' ? value.rootPath.trim() : '';
    const credentialRef = typeof value.credentialRef === 'string' ? value.credentialRef.trim() : '';
    if (!sshHost.test(host) || !sshUsername.test(username) || !rootPath.startsWith('/') || rootPath.length > 4096 || containsControl(rootPath)
      || credentialRef.length > 500 || !opaqueCredentialRef.test(credentialRef) || !Number.isSafeInteger(value.port) || (value.port as number) < 1 || (value.port as number) > 65535) {
      throw invalidWorkspaceAssignment();
    }
    return { kind: 'ssh', host, port: value.port as number, username, rootPath, credentialRef };
  }
  throw invalidWorkspaceAssignment();
}

export type EmployeeSession = {
  contextTagIds?: string[];
  id: string;
  contextRatio: number; // 0 - 100
  updatedAt: string;
  messages: MessageItem[];
  metrics: ContextMetric[];
  execution?: SessionExecution;
};

export type ArtifactRef = {
  id: string;
  sha256: string;
  size: number;
  mediaType?: string;
  fileName: string;
  createdAt: string;
};

export type WorkspaceManifest = {
  schemaVersion: 1;
  teamId: string;
  workspaceId: string;
  mode: 'local' | 'git';
  remoteRef?: { url: string; branch?: string };
  revision: number;
  artifacts: ArtifactRef[];
};

export type WorkspaceUploadRequest = { teamId: string; workspaceId: string; fileName: string; mediaType?: string; bytes: Uint8Array };
export type WorkspaceDownloadRequest = { teamId: string; workspaceId: string; artifactId: string };
export type WorkspaceSyncRequest = { teamId: string; workspaceId: string; direction: 'pull' | 'push'; expectedRevision?: number };
export type WorkspaceSyncResult = { status: 'completed' | 'conflict'; manifest: WorkspaceManifest };

export type WeWorkEmployee = {
  id: string;
  displayName: string;
  roleName: string;
  color: string;
  status: 'idle' | 'working' | 'blocked' | 'success' | 'error';
  isLead?: boolean;
  runtime: 'Pi' | 'Claude Code' | 'DSH' | 'Workspace';
  defaultRuntimeProfileId?: string;
  workspaceAssignment?: WorkspaceAssignment;
  builtInSkills: SkillRef[];
  activeSession: EmployeeSession;
  artifacts: ArtifactItem[];
  currentWorkItem?: WorkItem;
  queuedWorkItems?: WorkItem[];
  completedWorkItems?: WorkItem[];
};

export type RoleNode = {
  id: string;
  roleName: string;
  label: string;
  stepNumber: number;
  status: 'ready' | 'running' | 'completed' | 'blocked' | 'waiting';
  assignedEmployeeId?: string;
  requires?: string[];
  position?: { x: number; y: number };
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  nodes: RoleNode[];
  version?: number;
};

export type WeWorkTeam = {
  weworkSessionId?: string;
  archivedAt?: string;
  workspaceAssignment?: WorkspaceAssignment;
  collaborationDeliveries?: CollaborationDelivery[];
  handoffs?: Handoff[];
  cancelledWorks?: WorkItem[];
  id: string;
  name: string;
  description: string;
  topology: 'roundTable' | 'workflowDag';
  defaultRuntimeProfileId?: string;
  employees: WeWorkEmployee[];
  pendingWorks: WorkItem[];
  teamMessages?: MessageItem[];
  workflow?: WorkflowTemplate;
  modules?: TeamModuleRegistry;
  collaborationDatabase?: CollaborationDatabase;
};

export type TeamView = 'roundTable' | 'workflowDag' | 'teamManagement' | 'issues' | 'board' | 'gantt';
