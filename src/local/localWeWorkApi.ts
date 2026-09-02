import { createCollaborationApi } from './collaborationState.ts';
import { acceptedDeliverable, createWorkContextApi } from './workContext.ts';
import type {
  MessageItem, WeWorkEmployee, WeWorkTeam, RuntimeProfile, SessionExecution, SkillRef, WorkItem, WorkflowTemplate,
  WorkspaceAssignment, WorkspaceDownloadRequest, WorkspaceSyncRequest, WorkspaceUploadRequest,
} from '../domain/wework.ts';
import { normalizeRuntimeProfile, normalizeRuntimeProfileDraft, normalizeSessionExecution, normalizeWorkspaceAssignment } from '../domain/wework.ts';
import type { CollaborationWorkItem, ProjectCapability, TeamModuleRegistry } from '../domain/collaboration.ts';
import { createCollaborationDatabase, normalizeCollaborationDatabase, normalizeTeamModules } from '../domain/collaboration.ts';

type LocalState = { teams: WeWorkTeam[]; runtimeProfiles: RuntimeProfile[]; eventCursor: number };
type WorkInput = Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category' | 'runtimeProfileId' | 'constraints' | 'acceptanceCriteria'>;

export interface WeWorkStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryWeWorkStorage implements WeWorkStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const clone = <T>(value: T): T => structuredClone(value);
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const normalizeTeams = (input: unknown): WeWorkTeam[] => {
  if (!Array.isArray(input)) throw new Error('invalid WeWork teams');
  const teams = clone(input) as WeWorkTeam[];
  const teamIds = new Set<string>();
  const employeeIds = new Set<string>();
  for (const team of teams) {
    if (!team || typeof team !== 'object' || typeof team.id !== 'string' || !safeIdentifier.test(team.id) || teamIds.has(team.id) || !Array.isArray(team.employees)) throw new Error('invalid immutable team id');
    teamIds.add(team.id);
    team.modules = normalizeTeamModules(team.modules);
    team.collaborationDatabase = normalizeCollaborationDatabase(team.collaborationDatabase);
    team.workspaceAssignment = normalizeWorkspaceAssignment(team.workspaceAssignment);
    for (const employee of team.employees) {
      if (!employee || typeof employee !== 'object' || typeof employee.id !== 'string' || !safeIdentifier.test(employee.id) || employeeIds.has(employee.id)) throw new Error('invalid immutable employee id');
      employeeIds.add(employee.id);
      employee.workspaceAssignment = normalizeWorkspaceAssignment(employee.workspaceAssignment);
      if (employee.activeSession?.execution !== undefined) employee.activeSession.execution = normalizeSessionExecution(employee.activeSession.execution);
    }
  }
  return teams;
};

const sessionExecutionFromProfile = (profile: RuntimeProfile) => ({
  id: profile.id, name: profile.name, adapter: profile.adapter, model: clone(profile.model),
  systemPrompt: profile.systemPrompt, thinkingLevel: profile.thinkingLevel, enabled: profile.enabled,
  sourceProfileId: profile.id, profileRevision: 1,
});

export const migrateSessionExecution = (state: LocalState) => {
  let changed = false;
  for (const team of state.teams) for (const employee of team.employees) {
    if (employee.activeSession.execution) continue;
    const profileId = employee.defaultRuntimeProfileId ?? team.defaultRuntimeProfileId;
    const profile = state.runtimeProfiles.find((candidate) => candidate.id === profileId);
    if (profile) { employee.activeSession.execution = sessionExecutionFromProfile(profile); changed = true; }
  }
  return changed;
};

export function createLocalWeWorkApi(
  storage: WeWorkStorage,
  options: { storageKey?: string } = {},
) {
  const key = options.storageKey ?? 'wework.local.v1';
  const read = (): LocalState => {
    const raw = storage.getItem(key);
    const state = raw ? JSON.parse(raw) : { teams: [], runtimeProfiles: [], eventCursor: 0 };
    if (!Array.isArray(state.runtimeProfiles) || !Number.isSafeInteger(state.eventCursor) || state.eventCursor < 0) throw new Error('invalid local snapshot');
    state.runtimeProfiles = state.runtimeProfiles.map((profile: unknown) => normalizeRuntimeProfile(profile));
    const teamsBeforeMigration = JSON.stringify(state.teams);
    state.teams = normalizeTeams(state.teams);
    if (migrateSessionExecution(state) || teamsBeforeMigration !== JSON.stringify(state.teams)) storage.setItem(key, JSON.stringify(state));
    return state;
  };
  const write = (state: LocalState) => {
    state.eventCursor += 1;
    storage.setItem(key, JSON.stringify(state));
  };
  const mutate = <T>(operation: (state: LocalState) => T): T => {
    const state = read();
    const result = operation(state);
    write(state);
    return clone(result);
  };
  const findEmployee = (state: LocalState, employeeId: string) => {
    for (const team of state.teams) {
      const employee = team.employees.find((candidate) => candidate.id === employeeId);
      if (employee) return { team, employee };
    }
    throw new Error('employee not found');
  };
  const findWork = (state: LocalState, workId: string) => {
    for (const team of state.teams) {
      const cancelled = team.cancelledWorks?.find((work) => work.id === workId);
      if (cancelled) return { team, work: cancelled, location: 'cancelled' as const };
      const pending = team.pendingWorks.find((work) => work.id === workId);
      if (pending) return { team, work: pending, location: 'pending' as const };
      for (const employee of team.employees) {
        if (employee.currentWorkItem?.id === workId) return { team, employee, work: employee.currentWorkItem, location: 'current' as const };
        const completed = employee.completedWorkItems?.find((work) => work.id === workId);
        if (completed) return { team, employee, work: completed, location: 'completed' as const };
        const queued = employee.queuedWorkItems?.find((work) => work.id === workId);
        if (queued) return { team, employee, work: queued, location: 'queued' as const };
      }
    }
    throw new Error('work not found');
  };
  const promoteNext = (employee: WeWorkEmployee) => {
    const [next, ...remaining] = employee.queuedWorkItems ?? [];
    employee.currentWorkItem = next ? { ...next, status: 'running' } : undefined;
    employee.queuedWorkItems = remaining;
    employee.status = next ? 'working' : 'idle';
  };
  const findTeam = (state: LocalState, teamId: string) => {
    const team = state.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new Error('team not found');
    return team;
  };
  const requireCapability = (team: WeWorkTeam, capabilities: ProjectCapability[]) => {
    const module = team.modules!.projectManagement;
    if (!module.installed || !module.enabled || !capabilities.some((capability) => module.capabilities.includes(capability))) {
      throw Object.assign(new Error('project management capability is disabled'), { code: 'CAPABILITY_DISABLED' });
    }
    if (!team.collaborationDatabase) throw new Error('collaboration database is unavailable');
    return team.collaborationDatabase;
  };

  return {
    ...createCollaborationApi({ read, mutate, locate: findWork }),
    ...createWorkContextApi({ read, mutate, locate: findWork }),
    importLocalState: async (input: LocalState) => {
      const state = read();
      if (state.teams.length || state.runtimeProfiles.length) return { imported: false };
      if (!Array.isArray(input.teams) || !Array.isArray(input.runtimeProfiles)) throw new Error('invalid local snapshot');
      const teams = normalizeTeams(input.teams);
      const runtimeProfiles = input.runtimeProfiles.map((profile) => normalizeRuntimeProfile(profile));
      state.teams = teams; state.runtimeProfiles = runtimeProfiles;
      state.teams.forEach((team) => { team.weworkSessionId ??= identifier('wework'); });
      write(state); return { imported: true };
    },
    snapshot: async (options?: { includeArchived?: boolean }) => {
      const state = clone(read());
      if (!options?.includeArchived) state.teams = state.teams.filter((team) => !team.archivedAt);
      return state;
    },
    listRuntimeProfiles: async () => ({ profiles: clone(read().runtimeProfiles) }),
    bootstrap: async (teams: WeWorkTeam[]) => {
      const state = read();
      if (state.teams.length) return { imported: false };
      state.teams = normalizeTeams(teams);
      state.teams.forEach((team) => { team.weworkSessionId ??= identifier('wework'); });
      write(state);
      return { imported: true };
    },
    createRuntimeProfile: async (input: Omit<RuntimeProfile, 'id' | 'createdAt' | 'updatedAt'>) => mutate((state) => {
      const timestamp = now();
      const profile: RuntimeProfile = { ...normalizeRuntimeProfileDraft(input), id: identifier('runtime'), createdAt: timestamp, updatedAt: timestamp };
      state.runtimeProfiles.push(profile);
      return profile;
    }),
    uploadWorkspaceArtifact: async (_request: WorkspaceUploadRequest) => {
      throw Object.assign(new Error('workspace artifact transport requires the local Host'), { code: 'WORKSPACE_HOST_REQUIRED' });
    },
    downloadWorkspaceArtifact: async (_request: WorkspaceDownloadRequest) => {
      throw Object.assign(new Error('workspace artifact transport requires the local Host'), { code: 'WORKSPACE_HOST_REQUIRED' });
    },
    syncWorkspace: async (_request: WorkspaceSyncRequest) => {
      throw Object.assign(new Error('remote workspace sync is not implemented'), { code: 'WORKSPACE_SYNC_UNAVAILABLE' });
    },
    createTeam: async (input: { name: string; description?: string; leadName?: string; leadRole?: string; runtime?: WeWorkEmployee['runtime']; sessionExecution?: SessionExecution }) => mutate((state) => {
      const lead: WeWorkEmployee = {
        id: identifier('employee'), displayName: input.leadName || 'Employee-01', roleName: input.leadRole || '团队负责人',
        color: '#C8102E', status: 'idle', runtime: input.runtime || 'Pi', isLead: true, builtInSkills: [],
        activeSession: { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [] },
        artifacts: [], queuedWorkItems: [], completedWorkItems: [],
      };
      if (input.sessionExecution) lead.activeSession.execution = normalizeSessionExecution(input.sessionExecution);
      const team: WeWorkTeam = { weworkSessionId: identifier('wework'), id: identifier('team'), name: input.name, description: input.description || '', topology: 'roundTable', employees: [lead], pendingWorks: [], modules: normalizeTeamModules(undefined) };
      state.teams.push(team);
      return team;
    }),
    configureTeamModules: async (teamId: string, input: TeamModuleRegistry) => mutate((state) => {
      const team = findTeam(state, teamId);
      team.modules = normalizeTeamModules(input);
      if (team.modules!.projectManagement.installed && !team.collaborationDatabase) team.collaborationDatabase = createCollaborationDatabase(now());
      if (!team.modules!.projectManagement.capabilities.includes('dag') && team.topology === 'workflowDag') team.topology = 'roundTable';
      return team;
    }),
    createCollaborationWorkItem: async (teamId: string, input: Pick<CollaborationWorkItem, 'projectId' | 'title'> & Partial<Omit<CollaborationWorkItem, 'id' | 'projectId' | 'title' | 'createdAt' | 'updatedAt'>>) => mutate((state) => {
      const team = findTeam(state, teamId); const database = requireCapability(team, ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database']);
      if (!database.projects.some((project) => project.id === input.projectId) || !input.title?.trim()) throw new Error('invalid work item');
      const timestamp = now();
      const item: CollaborationWorkItem = { id: identifier('item'), projectId: input.projectId, title: input.title.trim(), description: input.description ?? '', statusId: input.statusId ?? database.statuses[0].id, priorityId: input.priorityId ?? database.priorities[1].id, labelIds: input.labelIds ?? [], assigneeIds: input.assigneeIds ?? [], cycleId: input.cycleId, milestoneId: input.milestoneId, startDate: input.startDate, dueDate: input.dueDate, createdAt: timestamp, updatedAt: timestamp };
      database.workItems.push(item); database.activities.push({ id: identifier('activity'), workItemId: item.id, action: 'work_item.created', createdAt: timestamp });
      return item;
    }),
    updateCollaborationWorkItem: async (teamId: string, workItemId: string, patch: Partial<Pick<CollaborationWorkItem, 'title' | 'description' | 'statusId' | 'priorityId' | 'cycleId' | 'milestoneId' | 'labelIds' | 'assigneeIds' | 'startDate' | 'dueDate'>>) => mutate((state) => {
      const team = findTeam(state, teamId); const database = requireCapability(team, ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database']);
      const item = database.workItems.find((candidate) => candidate.id === workItemId); if (!item) throw new Error('work item not found');
      Object.assign(item, clone(patch), { updatedAt: now() });
      database.activities.push({ id: identifier('activity'), workItemId: item.id, action: 'work_item.updated', createdAt: item.updatedAt, details: clone(patch) });
      return item;
    }),
    deleteCollaborationDatabase: async (teamId: string, input: { confirm: boolean }) => mutate((state) => {
      if (!input?.confirm) throw Object.assign(new Error('explicit confirmation is required'), { code: 'CONFIRMATION_REQUIRED' });
      const team = findTeam(state, teamId); delete team.collaborationDatabase;
      team.modules = { projectManagement: { ...team.modules!.projectManagement, enabled: false } };
      return { deleted: true as const };
    }),
    archiveTeam: async (teamId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      team.archivedAt ??= now();
      return team;
    }),
    restoreTeam: async (teamId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      delete team.archivedAt;
      return team;
    }),
    deleteTeam: async (teamId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      if (!team.archivedAt) throw new Error('archive team before permanent deletion');
      state.teams = state.teams.filter((candidate) => candidate.id !== teamId);
      return { deleted: teamId, workspaceRetained: true as const };
    }),
    updateTeamWorkspace: async (teamId: string, workspaceAssignment?: WorkspaceAssignment) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      team.workspaceAssignment = normalizeWorkspaceAssignment(workspaceAssignment);
      return team;
    }),
    addEmployee: async (teamId: string, input: { displayName: string; roleName: string; runtime: WeWorkEmployee['runtime']; defaultRuntimeProfileId?: string; sessionExecution?: SessionExecution }) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      const employee: WeWorkEmployee = {
        id: identifier('employee'), displayName: input.displayName, roleName: input.roleName, color: '#0BA5EC', status: 'idle',
        runtime: input.runtime, defaultRuntimeProfileId: input.defaultRuntimeProfileId, builtInSkills: [],
        activeSession: { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [] },
        artifacts: [], queuedWorkItems: [], completedWorkItems: [],
      };
      const profile = state.runtimeProfiles.find((candidate) => candidate.id === input.defaultRuntimeProfileId);
      if (profile) employee.activeSession.execution = sessionExecutionFromProfile(profile);
      if (input.sessionExecution) employee.activeSession.execution = normalizeSessionExecution(input.sessionExecution);
      team.employees.push(employee);
      return employee;
    }),
    removeEmployee: async (teamId: string, employeeId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      const employee = team?.employees.find((candidate) => candidate.id === employeeId);
      if (!team || !employee) throw new Error('employee not found');
      if (employee.isLead) throw new Error('transfer team lead before removal');
      team.pendingWorks.push(...[employee.currentWorkItem, ...(employee.queuedWorkItems ?? [])]
        .filter((work): work is WorkItem => Boolean(work)).map((work) => ({ ...work, status: 'pending' as const, assignedEmployeeId: undefined })));
      if (employee.completedWorkItems?.length) throw new Error('employee has completed work history; retain this member');
      team.employees = team.employees.filter((candidate) => candidate.id !== employeeId);
      return { deleted: employeeId };
    }),
    updateEmployee: async (employeeId: string, input: { displayName: string; roleName: string; runtime: WeWorkEmployee['runtime']; skills: SkillRef[]; defaultRuntimeProfileId?: string; workspaceAssignment?: WorkspaceAssignment; sessionExecution?: SessionExecution; sessionContextTagIds?: string[]; startNewSession?: boolean }) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      Object.assign(employee, { displayName: input.displayName, roleName: input.roleName, runtime: input.runtime, builtInSkills: clone(input.skills), defaultRuntimeProfileId: input.defaultRuntimeProfileId, workspaceAssignment: normalizeWorkspaceAssignment(input.workspaceAssignment) });
      if (input.sessionContextTagIds) employee.activeSession.contextTagIds = [...new Set(input.sessionContextTagIds.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
      if (input.sessionExecution) {
        const sessionExecution = normalizeSessionExecution(input.sessionExecution);
        const current = employee.activeSession.execution;
        const hasContext = employee.activeSession.messages.length > 0 || employee.activeSession.metrics.length > 0 || employee.activeSession.contextRatio > 0;
        const changesHarness = !current || sessionExecution.adapter !== current.adapter;
        if (changesHarness && hasContext && !input.startNewSession) {
          throw Object.assign(new Error('Harness cannot change after a Session has context; reset or fork to a new Session first'), { code: 'SESSION_HARNESS_IMMUTABLE' });
        }
        if (current && sessionExecution.profileRevision < current.profileRevision) throw Object.assign(new Error('session execution revision cannot decrease'), { code: 'SESSION_EXECUTION_STALE', currentRevision: current.profileRevision });
        if (current && sessionExecution.profileRevision === current.profileRevision && JSON.stringify(sessionExecution) !== JSON.stringify(current)) throw Object.assign(new Error('session execution revision conflict'), { code: 'SESSION_EXECUTION_CONFLICT', currentRevision: current.profileRevision });
        if (changesHarness && hasContext && input.startNewSession) employee.activeSession = { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [], contextTagIds: employee.activeSession.contextTagIds, execution: sessionExecution };
        else employee.activeSession.execution = sessionExecution;
      } else {
        const profile = state.runtimeProfiles.find((candidate) => candidate.id === input.defaultRuntimeProfileId);
        if (profile && employee.activeSession.execution?.sourceProfileId !== profile.id) employee.activeSession.execution = sessionExecutionFromProfile(profile);
      }
      return employee;
    }),
    resetEmployeeContext: async (employeeId: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      employee.activeSession = { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [], execution: employee.activeSession.execution, contextTagIds: employee.activeSession.contextTagIds };
      return employee;
    }),
    setLead: async (teamId: string, employeeId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team?.employees.some((employee) => employee.id === employeeId)) throw new Error('employee not found');
      team.employees.forEach((employee) => { employee.isLead = employee.id === employeeId; });
      return { teamId, employeeId };
    }),
    createWork: async (teamId: string, input: WorkInput) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      const work: WorkItem = { ...clone(input), id: identifier('work'), status: 'pending', createdAt: now() };
      team.pendingWorks.push(work);
      return work;
    }),
    assignWork: async (workId: string, employeeId: string) => mutate((state) => {
      const located = findWork(state, workId);
      const { team: employeeTeam, employee } = findEmployee(state, employeeId);
      if (located.team.id !== employeeTeam.id || located.location !== 'pending') throw new Error('work cannot be assigned');
      if (employee.runtime === 'Pi' && !employee.defaultRuntimeProfileId && !located.work.runtimeProfileId && !employeeTeam.defaultRuntimeProfileId) {
        throw new Error('Pi employee requires an enabled Pi runtime profile');
      }
      located.team.pendingWorks = located.team.pendingWorks.filter((work) => work.id !== workId);
      const assigned = { ...located.work, assignedEmployeeId: employeeId, status: employee.currentWorkItem ? 'pending' as const : 'running' as const };
      if (employee.currentWorkItem) employee.queuedWorkItems = [...(employee.queuedWorkItems ?? []), assigned];
      else { employee.currentWorkItem = assigned; employee.status = 'working'; }
      return assigned;
    }),
    updateWork: async (workId: string, input: Partial<Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category'>>) => mutate((state) => {
      const located = findWork(state, workId);
      if (['completed', 'cancelled'].includes(located.location)) throw new Error('archived work is read-only');
      Object.assign(located.work, clone(input));
      if (located.work.records?.deliverables.length) located.work.deliveryStatus = 'changes_requested';
      return located.work;
    }),
    cancelWork: async (workId: string) => mutate((state) => {
      const located = findWork(state, workId);
      if (located.location === 'cancelled') return located.work;
      if (located.location === 'completed') throw new Error('completed work cannot be cancelled');
      located.work.cancelledAt = now();
      (located.team.cancelledWorks ??= []).push(located.work);
      located.work.status = 'blocked';
      if (located.location === 'pending') located.team.pendingWorks = located.team.pendingWorks.filter((work) => work.id !== workId);
      if (located.location === 'queued' && located.employee) located.employee.queuedWorkItems = located.employee.queuedWorkItems?.filter((work) => work.id !== workId);
      if (located.location === 'current' && located.employee) { located.employee.currentWorkItem = undefined; promoteNext(located.employee); }
      return located.work;
    }),
    completeCurrent: async (employeeId: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      if (!employee.currentWorkItem) throw new Error('employee has no running work');
      if (!acceptedDeliverable(employee.currentWorkItem)) throw new Error('an accepted deliverable is required before completion');
      const completed = { ...employee.currentWorkItem, status: 'completed' as const };
      employee.completedWorkItems = [...(employee.completedWorkItems ?? []), completed];
      promoteNext(employee);
      return completed;
    }),
    returnCurrent: async (employeeId: string) => mutate((state) => {
      const { team, employee } = findEmployee(state, employeeId);
      if (!employee.currentWorkItem) throw new Error('employee has no running work');
      const returned = { ...employee.currentWorkItem, status: 'pending' as const, assignedEmployeeId: undefined };
      team.pendingWorks.push(returned);
      promoteNext(employee);
      return returned;
    }),
    getWorkflow: async (teamId: string) => {
      const workflow = read().teams.find((team) => team.id === teamId)?.workflow;
      if (!workflow) throw new Error('workflow not found');
      return clone(workflow);
    },
    saveWorkflow: async (teamId: string, workflow: WorkflowTemplate) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      if (team.workflow && workflow.version !== team.workflow.version) {
        throw Object.assign(new Error('workflow version conflict'), { code: 'VERSION_CONFLICT', currentVersion: team.workflow.version });
      }
      const saved = { ...clone(workflow), version: (team.workflow?.version ?? 0) + 1 };
      team.workflow = saved;
      return saved;
    }),
    sendMessage: async (employeeId: string, text: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      const message = { id: identifier('message'), sender: 'user' as const, text, time: now() };
      employee.activeSession.messages.push(message);
      employee.activeSession.updatedAt = now();
      return message;
    }),
    sendAssistantMessage: async (employeeId: string, text: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      const message: MessageItem = { id: identifier('message'), sender: 'employee', senderName: employee.displayName, text, time: now() };
      employee.activeSession.messages.push(message);
      employee.activeSession.updatedAt = now();
      return message;
    }),
    sendTeamMessage: async (teamId: string, text: string, actor?: { employeeId: string; runId: string }, contextTagIds?: string[]) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('invalid team message');
      const author = actor ? team.employees.find((employee) => employee.id === actor.employeeId) : undefined;
      if (actor && !author) throw new Error('team message actor is not a member');
      const message: MessageItem = { id: identifier('team-message'), sender: author ? 'employee' : 'user', senderName: author?.displayName ?? '你', text, time: now(), sourceRunId: actor?.runId, contextTagIds: [...new Set((contextTagIds ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20) };
      team.teamMessages = [...(team.teamMessages ?? []), message];
      return message;
    }),
    eventSource: (_cursor: number) => ({
      addEventListener: (_type: string, _listener: EventListenerOrEventListenerObject) => undefined,
      onerror: null as ((event: Event) => void) | null,
      close: () => undefined,
    }),
  };
}
