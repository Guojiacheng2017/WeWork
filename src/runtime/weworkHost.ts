import { normalizeWorkspaceAssignment, type ResolvedWorkspace, type WorkspaceAssignment } from '../domain/wework';

export type CredentialKind = 'ssh-password' | 'ssh-private-key' | 'model-api-key' | 'integration-api-key';
export type CredentialMetadata = { ref: string; label: string; kind: CredentialKind };
export type HarnessId = 'pi' | 'claude-code' | 'codex-cli' | 'gemini-cli' | 'smalldashharness';
export type HarnessCapabilities = { streaming: boolean; resumeSession: boolean; cancellation: boolean; workspace: boolean; tools: boolean };
export type HarnessInstallation = {
  id: string;
  harness: HarnessId;
  kind: 'embedded' | 'executable' | 'local-service';
  available: boolean;
  executionReady?: boolean;
  weworkToolsReady?: boolean;
  reason?: string;
  diagnostics?: { lookupCommand: string; path: string; candidates: string[]; attempts: Array<{ executablePath: string; error: string }> };
  executablePath?: string;
  version?: string;
  capabilities: HarnessCapabilities;
  configuration?: { source: 'wework' | 'harness' | 'service'; provider?: string; modelId?: string };
};
export type HarnessModel = {
  id: string; harness: HarnessId; name: string; provider: string; modelId: string;
  api?: 'openai-completions' | 'openai-responses'; baseUrl?: string; credentialRef?: string; apiKeyEnv?: string;
  source?: 'wework-managed' | 'harness-discovered';
  authentication?: 'none'; configured?: boolean; verified: boolean; isDefault: boolean; createdAt: string; updatedAt: string;
};
export type HarnessModelInput = Omit<HarnessModel, 'id' | 'isDefault' | 'createdAt' | 'updatedAt'> & { id?: string };
export type HarnessModelCatalogResult = { models: HarnessModel[]; defaults: Partial<Record<HarnessId, string>> };
export type SdhConnection = { baseUrl: string; configured: boolean; reachable?: boolean; service?: string; error?: string };
export type AvailableSkill = { id: string; name: string; description: string; source: 'wework' | 'workspace' };
export type DiagnosticEntry = { id: number; time: string; level: 'info' | 'error'; source: string; message: string; details?: Record<string, unknown> };
export type DiagnosticSnapshot = { status: { host: 'ready' | 'unavailable'; pid: number | null }; entries: DiagnosticEntry[] };
export type SkillCatalogResult = { skills: AvailableSkill[]; reason?: string };
export type PluginManifest = { name: string; version: string; description: string; enabled: boolean; source: 'bundled' | 'installed'; mcpServers?: string | Record<string, unknown>; interface?: { displayName?: string; shortDescription?: string; capabilities?: string[] } };
export type PluginInvocation = { teamId: string; pluginName: string; tool: string; input?: Record<string, unknown> };
export type SkillDiscoveryRequest = WorkspaceAssignment | {
  teamId?: string; employeeId?: string;
  team?: { id: string; name: string; workspaceAssignment?: WorkspaceAssignment };
  employee?: { id: string; displayName?: string; workspaceAssignment?: WorkspaceAssignment };
  inheritTeam?: boolean;
  workspaceAssignment?: WorkspaceAssignment;
};
export interface CredentialVault {
  create(input: { label: string; kind: CredentialKind; secret: string }): Promise<string>;
  list(): Promise<CredentialMetadata[]>;
  resolve(ref: string): Promise<string>;
}

export class MemoryCredentialVault implements CredentialVault {
  private entries = new Map<string, CredentialMetadata & { secret: string }>();
  async create(input: { label: string; kind: CredentialKind; secret: string }) {
    const ref = `vault:${crypto.randomUUID()}`;
    this.entries.set(ref, { ref, ...input });
    return ref;
  }
  async list() {
    return [...this.entries.values()].map(({ secret: _secret, ...metadata }) => metadata);
  }
  async resolve(ref: string) {
    const entry = this.entries.get(ref);
    if (!entry) throw new Error('credential not found');
    return entry.secret;
  }
}

export interface DirectoryHost {
  current(): Promise<string>;
  choose(): Promise<string | null>;
}

export type SshTestRequest = {
  host: string; port: number; username: string; rootPath: string;
  secret: string; credentialKind: Extract<CredentialKind, 'ssh-password' | 'ssh-private-key'>;
};
export type WorkspaceProbe = { ok: boolean; latencyMs?: number; canonicalRoot?: string; error?: string };
export type WeWorkDataInfo = { rootPath: string; configPath: string; teamsPath: string; runtimePath: string; platform: string; /** @deprecated old hosts only */ workspaceManifest?: string };
export type WeWorkHostErrorCode = 'HOST_UNAVAILABLE' | 'HOST_UNAUTHORIZED' | 'CREDENTIAL_MISSING' | 'SSH_FAILED' | 'RUNTIME_PROFILE_MISSING' | 'RUN_ALREADY_ACTIVE' | 'RUN_NOT_ACTIVE' | 'VERSION_CONFLICT' | 'HOST_INTERNAL';

export class WeWorkHostError extends Error {
  constructor(public code: WeWorkHostErrorCode, message: string, public status?: number) { super(message); }
}

export interface SshHost {
  test(request: SshTestRequest): Promise<WorkspaceProbe>;
}

export class WeWorkHost {
  constructor(private ports: { vault: CredentialVault; directories: DirectoryHost; ssh: SshHost }) {}
  credentials() { return this.ports.vault.list(); }
  harnesses(): Promise<HarnessInstallation[]> { return Promise.resolve([]); }
  harnessPolicy() { return Promise.resolve({ allowedHarnesses: [] as HarnessId[] }); }
  harnessModels(): Promise<HarnessModelCatalogResult> { return Promise.resolve({ models: [], defaults: {} }); }
  sdhConnection(): Promise<SdhConnection> { return Promise.resolve({ baseUrl: '', configured: false }); }
  setSdhConnection(_baseUrl: string): Promise<SdhConnection> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','远程 Harness 配置需要 Desktop Host')); }
  skills(_assignment?: SkillDiscoveryRequest): Promise<SkillCatalogResult> { return Promise.resolve({ skills: [], reason: '浏览器模式无法扫描本机或 Workspace Skill；请使用 Desktop Host' }); }
  dataInfo(): Promise<WeWorkDataInfo> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','数据目录需要 Desktop Host')); }
  setHarnessPolicy(_allowedHarnesses: HarnessId[]): Promise<{allowedHarnesses: HarnessId[]}> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','设备策略需要 Desktop Host')); }
  saveHarnessModel(_input: HarnessModelInput): Promise<HarnessModel> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','模型目录需要 Desktop Host')); }
  probeHarnessModel(_input: HarnessModelInput): Promise<{ok: boolean; modelIds?: string[]; error?: string}> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','模型检查需要 Desktop Host')); }
  setDefaultHarnessModel(_harness: HarnessId, _modelId: string): Promise<HarnessModelCatalogResult> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','模型目录需要 Desktop Host')); }
  createCredential(input: { label: string; kind: CredentialKind; secret: string }) { return this.ports.vault.create(input); }
  plugins(): Promise<PluginManifest[]> { return Promise.resolve([]); }
  setPluginEnabled(_name: string, _enabled: boolean): Promise<PluginManifest[]> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','Plugin 管理需要 Desktop Host')); }
  installPlugin(): Promise<PluginManifest[] | null> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','Plugin 安装需要 Desktop Host')); }
  invokePlugin(_input: PluginInvocation): Promise<Record<string, unknown>> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','Plugin 需要 Desktop Host')); }
  async currentWorkspace(): Promise<ResolvedWorkspace> {
    return { kind: 'local', rootPath: await this.ports.directories.current() };
  }
  async chooseLocalWorkspace(): Promise<ResolvedWorkspace | null> {
    const rootPath = await this.ports.directories.choose();
    return rootPath ? { kind: 'local', rootPath } : null;
  }
  async testSshWorkspace(assignment: Extract<WorkspaceAssignment, { kind: 'ssh' }>): Promise<WorkspaceProbe> {
    const normalized = normalizeWorkspaceAssignment(assignment);
    if (normalized?.kind !== 'ssh') throw new Error('SSH Workspace assignment is invalid');
    const metadata = (await this.ports.vault.list()).find((item) => item.ref === normalized.credentialRef);
    if (!metadata || !['ssh-password', 'ssh-private-key'].includes(metadata.kind)) throw new Error('SSH credential reference is invalid');
    return this.ports.ssh.test({
      host: normalized.host, port: normalized.port, username: normalized.username,
      rootPath: normalized.rootPath, secret: await this.ports.vault.resolve(normalized.credentialRef),
      credentialKind: metadata.kind as 'ssh-password' | 'ssh-private-key',
    });
  }
}

export type PortableMessage = { role: string; content: unknown };
export type SessionCheckpoint = { messages: PortableMessage[] };
export type RunSpec = {
  runId: string; employeeId: string; workId: string; prompt: string; checkpoint: SessionCheckpoint;
};
export type RuntimeEvent =
  | { type: 'wework.updated'; runId: string }
  | { type: 'run.started'; runId: string }
  | { type: 'assistant.delta'; runId: string; text: string }
  | { type: 'assistant.activity'; runId: string; activity: 'thinking' | 'tool' | 'status'; text: string }
  | { type: 'run.succeeded'; runId: string; finalText: string }
  | { type: 'run.cancelled'; runId: string; error?: string }
  | { type: 'run.failed'; runId: string; error: string };
export type RuntimeResult = { messages: PortableMessage[]; finalText: string };

export interface RuntimeAdapter {
  run(spec: RunSpec, emit: (event: RuntimeEvent) => void): Promise<RuntimeResult>;
}

export class RuntimeCoordinator {
  private listeners = new Set<(event: RuntimeEvent) => void>();
  constructor(private ports: {
    adapter: RuntimeAdapter;
    saveCheckpoint: (checkpoint: { employeeId: string; messages: PortableMessage[] }) => Promise<void>;
  }) {}
  subscribe(listener: (event: RuntimeEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit(event: RuntimeEvent) { this.listeners.forEach((listener) => listener(event)); }
  async run(spec: RunSpec): Promise<RuntimeResult> {
    this.emit({ type: 'run.started', runId: spec.runId });
    try {
      const result = await this.ports.adapter.run(spec, (event) => this.emit(event));
      await this.ports.saveCheckpoint({ employeeId: spec.employeeId, messages: result.messages });
      this.emit({ type: 'run.succeeded', runId: spec.runId, finalText: result.finalText });
      return result;
    } catch (error) {
      this.emit({ type: 'run.failed', runId: spec.runId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export function unavailableBrowserHost(): WeWorkHost {
  const unavailable = () => Promise.reject(new Error('This capability requires the WeWork desktop host'));
  return new WeWorkHost({
    vault: { create: unavailable, list: unavailable, resolve: unavailable },
    directories: { current: unavailable, choose: unavailable },
    ssh: { test: unavailable },
  });
}

export class LoopbackWeWorkHost {
  constructor(private config: { baseUrl: string; token: string; fetch?: typeof fetch }) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl}${path}`, {
      ...init, headers: { authorization: `Bearer ${this.config.token}`, 'content-type': 'application/json', ...init?.headers },
    });
    const payload = await response.json();
    if (!response.ok) throw new WeWorkHostError(payload.error?.code ?? 'HOST_INTERNAL', payload.error?.message ?? 'WeWork Host request failed', response.status);
    return payload;
  }
  weworkCall(method: string, args: unknown[]) { return this.request<unknown>('/v1/wework/call', { method: 'POST', body: JSON.stringify({ method, args }) }); }
  currentWorkspace() { return this.request<ResolvedWorkspace>('/v1/workspaces/current'); }
  dataInfo() { return this.request<WeWorkDataInfo>('/v1/data/info'); }
  harnesses() { return this.request<{ installations: HarnessInstallation[] }>('/v1/harnesses').then((value) => value.installations); }
  harnessPolicy() { return this.request<{ allowedHarnesses: HarnessId[] }>('/v1/harnesses/policy'); }
  setHarnessPolicy(allowedHarnesses: HarnessId[]) { return this.request<{ allowedHarnesses: HarnessId[] }>('/v1/harnesses/policy', { method: 'POST', body: JSON.stringify({ allowedHarnesses }) }); }
  harnessModels() { return this.request<HarnessModelCatalogResult>('/v1/harnesses/models'); }
  sdhConnection() { return this.request<SdhConnection>('/v1/harnesses/smalldash/connection'); }
  setSdhConnection(baseUrl: string) { return this.request<SdhConnection>('/v1/harnesses/smalldash/connection', { method: 'POST', body: JSON.stringify({ baseUrl }) }); }
  skills(assignment?: SkillDiscoveryRequest) { return this.request<SkillCatalogResult>('/v1/skills/discover', { method: 'POST', body: JSON.stringify(assignment ?? {}) }); }
  saveHarnessModel(input: HarnessModelInput) { return this.request<HarnessModel>('/v1/harnesses/models', { method: 'POST', body: JSON.stringify(input) }); }
  probeHarnessModel(input: HarnessModelInput) { return this.request<{ok: boolean; modelIds?: string[]; error?: string}>('/v1/harnesses/models/probe', { method: 'POST', body: JSON.stringify(input) }); }
  setDefaultHarnessModel(harness: HarnessId, modelId: string) { return this.request<HarnessModelCatalogResult>('/v1/harnesses/models/default', { method: 'POST', body: JSON.stringify({ harness, modelId }) }); }
  chooseLocalWorkspace() { return this.request<ResolvedWorkspace | null>('/v1/workspaces/local/choose', { method: 'POST' }); }
  credentials() { return this.request<{ credentials: CredentialMetadata[] }>('/v1/credentials').then((value) => value.credentials); }
  createCredential(input: { label: string; kind: CredentialKind; secret: string }) { return this.request<{ ref: string }>('/v1/credentials', { method: 'POST', body: JSON.stringify(input) }).then((value) => value.ref); }
  plugins() { return this.request<{plugins:PluginManifest[]}>('/v1/plugins').then(value=>value.plugins); }
  setPluginEnabled(name: string, enabled: boolean) { return this.request<{plugins:PluginManifest[]}>('/v1/plugins/policy', { method:'POST', body:JSON.stringify({name,enabled}) }).then(value=>value.plugins); }
  installPlugin(): Promise<PluginManifest[] | null> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE','请在桌面版中选择并安装 Plugin')); }
  invokePlugin(input: PluginInvocation) { return this.request<Record<string,unknown>>('/v1/plugins/invoke', { method: 'POST', body: JSON.stringify(input) }); }
  testSshWorkspace(assignment: Extract<WorkspaceAssignment, { kind: 'ssh' }>) { return this.request<WorkspaceProbe>('/v1/workspaces/ssh/probe', { method: 'POST', body: JSON.stringify(assignment) }); }
  startRun(spec: object) { return this.request<{ id: string; status: string }>('/v1/runs', { method: 'POST', body: JSON.stringify(spec) }); }
  steerEmployee(employeeId: string, message: string) { return this.request<{accepted: boolean; runId?: string}>(`/v1/employees/${encodeURIComponent(employeeId)}/steer`, {method:'POST', body:JSON.stringify({message})}); }
  stopEmployee(employeeId: string) { return this.weworkCall('stopEmployee', [employeeId]); }
  cancelRun(runId: string) { return this.request<{ accepted: boolean }>(`/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }); }
  run(runId: string) { return this.request<{ id: string; status: string; finalText?: string; error?: string }>(`/v1/runs/${encodeURIComponent(runId)}`); }
  events(after = 0) { return this.request<{ events: Array<RuntimeEvent & { id: number }>; cursor: number }>('/v1/events', { headers: { 'last-event-id': String(after) } }); }
  diagnostics(): Promise<DiagnosticSnapshot> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE', '监控台只在 Desktop App 可用')); }
  clearDiagnostics(): Promise<DiagnosticSnapshot> { return Promise.reject(new WeWorkHostError('HOST_UNAVAILABLE', '监控台只在 Desktop App 可用')); }
}

export class LoopbackRuntimeEvents {
  private polling = false;
  private cursor = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(event: RuntimeEvent) => void>();
  constructor(private host: LoopbackWeWorkHost, private intervalMs = 500) {}
  subscribe(listener: (event: RuntimeEvent) => void) {
    this.listeners.add(listener);
    if (!this.timer && !this.polling) void this.poll();
    return () => { this.listeners.delete(listener); if (!this.listeners.size && this.timer) { clearTimeout(this.timer); this.timer = null; } };
  }
  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const result = await this.host.events(this.cursor);
      for (const event of result.events) this.listeners.forEach((listener) => listener(event));
      this.cursor = result.cursor;
    } catch {
      // Keep the cursor and retry after transient Host restarts/disconnections.
    } finally {
      this.polling = false;
      if (this.listeners.size) this.timer = setTimeout(() => void this.poll(), this.intervalMs);
      else this.timer = null;
    }
  }
}

export const weworkHost: WeWorkHost | LoopbackWeWorkHost = typeof window !== 'undefined' && window.weworkHost
  ? window.weworkHost
  : unavailableBrowserHost();
