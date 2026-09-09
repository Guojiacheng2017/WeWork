export const PROJECT_CAPABILITIES = ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database'] as const;
export type ProjectCapability = typeof PROJECT_CAPABILITIES[number];

export type TeamModuleRegistry = {
  projectManagement: {
    installed: boolean; enabled: boolean; capabilities: ProjectCapability[];
    integration?: { provider: 'plane'; baseUrl: string; workspaceSlug: string; projectId: string; credentialRef: string; lastSyncedAt?: string };
  };
  plugins?: Record<string, TeamPluginInstallation>;
};
export type PluginPermission = 'network' | 'credentials:integration' | 'project:read' | 'project:write';
export type TeamPluginInstallation = { pluginId: string; version: string; enabled: boolean; permissions: PluginPermission[]; configuration: Record<string, unknown> };
export const PLANE_PLUGIN_ID = 'wework-plane';
export type PlanePluginConfiguration = { baseUrl: string; workspaceSlug: string; projectId: string; credentialRef: string; lastSyncedAt?: string };
export const planePluginConfiguration = (modules?: TeamModuleRegistry): PlanePluginConfiguration | undefined => {
  const value = modules?.plugins?.[PLANE_PLUGIN_ID]?.configuration;
  if (value) return value as PlanePluginConfiguration;
  return modules?.projectManagement.integration;
};

export type CollaborationProject = { id: string; name: string; description: string; createdAt: string; updatedAt: string };
export type CollaborationWorkItem = {
  id: string; projectId: string; title: string; description: string; statusId: string; priorityId: string;
  cycleId?: string; milestoneId?: string; labelIds: string[]; assigneeIds: string[];
  startDate?: string; dueDate?: string; createdAt: string; updatedAt: string;
};
export type CollaborationCycle = { id: string; projectId: string; name: string; startDate?: string; dueDate?: string };
export type CollaborationMilestone = { id: string; projectId: string; name: string; dueDate?: string };
export type CollaborationStatus = { id: string; name: string; category: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled'; color: string; position: number };
export type CollaborationPriority = { id: string; name: string; level: number; color: string };
export type CollaborationLabel = { id: string; name: string; color: string };
export type CollaborationAssignee = { id: string; employeeId: string; displayName: string };
export type CollaborationRelation = { id: string; sourceWorkItemId: string; targetWorkItemId: string; type: 'blocks' | 'depends_on' | 'relates_to' | 'duplicates' };
export type CollaborationComment = { id: string; workItemId: string; authorId: string; body: string; createdAt: string };
export type CollaborationActivity = { id: string; workItemId?: string; actorId?: string; action: string; createdAt: string; details?: Record<string, unknown> };

export type CollaborationDatabase = {
  schemaVersion: 1;
  projects: CollaborationProject[];
  workItems: CollaborationWorkItem[];
  cycles: CollaborationCycle[];
  milestones: CollaborationMilestone[];
  statuses: CollaborationStatus[];
  priorities: CollaborationPriority[];
  labels: CollaborationLabel[];
  assignees: CollaborationAssignee[];
  relations: CollaborationRelation[];
  comments: CollaborationComment[];
  activities: CollaborationActivity[];
};

const capabilitySet = new Set<string>(PROJECT_CAPABILITIES);
export const emptyTeamModules = (): TeamModuleRegistry => ({ projectManagement: { installed: false, enabled: false, capabilities: [] } });

export function normalizeTeamModules(input: unknown): TeamModuleRegistry {
  if (input === undefined) return emptyTeamModules();
  const pm = (input as TeamModuleRegistry)?.projectManagement;
  if (!pm || typeof pm.installed !== 'boolean' || typeof pm.enabled !== 'boolean' || !Array.isArray(pm.capabilities)
    || pm.capabilities.some((capability) => typeof capability !== 'string' || (!capabilitySet.has(capability) && (capability as string) !== 'dag'))) throw new Error('invalid team module registry');
  if (pm.enabled && !pm.installed) throw new Error('enabled module must be installed');
  let integration = pm.integration;
  if (integration !== undefined) {
    if (integration.provider !== 'plane' || !integration.baseUrl?.trim() || !integration.workspaceSlug?.trim() || !integration.projectId?.trim() || !integration.credentialRef?.trim()) throw new Error('invalid project integration');
    const url = new URL(integration.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid Plane base URL');
    integration = { ...integration, baseUrl: url.toString().replace(/\/$/, ''), workspaceSlug: integration.workspaceSlug.trim(), projectId: integration.projectId.trim(), credentialRef: integration.credentialRef.trim() };
  }
  const plugins = { ...((input as TeamModuleRegistry).plugins ?? {}) };
  if (pm.installed && !plugins[PLANE_PLUGIN_ID]) plugins[PLANE_PLUGIN_ID] = { pluginId: PLANE_PLUGIN_ID, version: '0.1.0', enabled: pm.enabled, permissions: ['project:read', 'project:write'], configuration: {} };
  for (const [id, plugin] of Object.entries(plugins)) {
    if (!plugin || plugin.pluginId !== id || typeof plugin.version !== 'string' || typeof plugin.enabled !== 'boolean' || !Array.isArray(plugin.permissions) || !plugin.configuration || typeof plugin.configuration !== 'object') throw new Error('invalid team plugin installation');
  }
  const capabilities = [...new Set(pm.capabilities)].filter((capability): capability is ProjectCapability => capabilitySet.has(capability));
  return { projectManagement: { installed: pm.installed, enabled: pm.enabled, capabilities }, plugins };
}

export function createCollaborationDatabase(timestamp: string): CollaborationDatabase {
  return {
    schemaVersion: 1,
    projects: [{ id: 'project-main', name: '团队项目', description: '', createdAt: timestamp, updatedAt: timestamp }],
    workItems: [], cycles: [], milestones: [], labels: [], assignees: [], relations: [], comments: [], activities: [],
    statuses: [
      { id: 'status-backlog', name: '待规划', category: 'backlog', color: '#94a3b8', position: 0 },
      { id: 'status-progress', name: '进行中', category: 'started', color: '#0ea5e9', position: 1 },
      { id: 'status-done', name: '已完成', category: 'completed', color: '#10b981', position: 2 },
    ],
    priorities: [
      { id: 'priority-low', name: '低', level: 1, color: '#94a3b8' },
      { id: 'priority-medium', name: '中', level: 2, color: '#f59e0b' },
      { id: 'priority-high', name: '高', level: 3, color: '#ef4444' },
    ],
  };
}

export function normalizeCollaborationDatabase(input: unknown): CollaborationDatabase | undefined {
  if (input === undefined) return undefined;
  const value = structuredClone(input) as CollaborationDatabase;
  const arrays = ['projects', 'workItems', 'cycles', 'milestones', 'statuses', 'priorities', 'labels', 'assignees', 'relations', 'comments', 'activities'] as const;
  if (!value || value.schemaVersion !== 1 || arrays.some((key) => !Array.isArray(value[key]))) throw new Error('invalid collaboration database');
  return value;
}
