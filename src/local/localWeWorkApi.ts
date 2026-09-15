import { ensureWorkbenchSession, employeeSessions } from '../domain/workbenchSessions.ts';
import { randomEmployeeName } from '../domain/employeeNames.ts';
import { employeeErrorKey } from '../domain/employeeWorkStatus.ts';
import { randomEmployeeColor, validateEmployeeColor } from '../domain/employeeColor.ts';
import { createCollaborationApi } from './collaborationState.ts';
import { acceptedDeliverable, createWorkContextApi, submittedDeliverable } from './workContext.ts';
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
const workflowLeadSkill = { id: 'wework-workflow-lead', name: 'WeWork 工作流负责人' };

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
    if (!team.workflows?.length && team.workflow) team.workflows = [team.workflow];
    if (team.workflows?.length) {
      team.activeWorkflowId = team.workflows.some((workflow) => workflow.id === team.activeWorkflowId) ? team.activeWorkflowId : team.workflow?.id ?? team.workflows[0].id;
      team.workflow = team.workflows.find((workflow) => workflow.id === team.activeWorkflowId) ?? team.workflows[0];
    }
    if (!team.workflowLeadSkillMigrated) {
      const lead = team.employees.find((employee) => employee.isLead);
      if (lead && !(lead.builtInSkills ??= []).some((skill) => skill.id === workflowLeadSkill.id)) lead.builtInSkills.push(clone(workflowLeadSkill));
      team.workflowLeadSkillMigrated = true;
    }
    for (const employee of team.employees) {
      if (!employee || typeof employee !== 'object' || typeof employee.id !== 'string' || !safeIdentifier.test(employee.id) || employeeIds.has(employee.id)) throw new Error('invalid immutable employee id');
      employeeIds.add(employee.id);
      employee.workspaceAssignment = normalizeWorkspaceAssignment(employee.workspaceAssignment);
      for (const session of employeeSessions(employee)) if (session?.execution !== undefined) session.execution = normalizeSessionExecution(session.execution);
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
  let cachedRaw: string | null | undefined;
  let cachedState: LocalState | undefined;
  const read = (): LocalState => {
    const raw = storage.getItem(key);
    if (cachedState && raw === cachedRaw) return clone(cachedState);
    const state = raw ? JSON.parse(raw) : { teams: [], runtimeProfiles: [], eventCursor: 0 };
    if (!Array.isArray(state.runtimeProfiles) || !Number.isSafeInteger(state.eventCursor) || state.eventCursor < 0) throw new Error('invalid local snapshot');
    state.runtimeProfiles = state.runtimeProfiles.map((profile: unknown) => normalizeRuntimeProfile(profile));
    const teamsBeforeMigration = JSON.stringify(state.teams);
    state.teams = normalizeTeams(state.teams);
    if (migrateSessionExecution(state) || teamsBeforeMigration !== JSON.stringify(state.teams)) storage.setItem(key, JSON.stringify(state));
    cachedRaw = storage.getItem(key);
    cachedState = clone(state);
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
      const completed = team.completedWorks?.find(work => work.id === workId);
      if (completed) return { team, work: completed, location: 'completed' as const };
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
    employee.executionActivity = { state: next ? 'waiting' : 'idle', detail: next ? '等待执行下一项工作' : '当前没有执行中的任务', updatedAt: now() };
  };
  const assignPendingWork = (team: WeWorkTeam, work: WorkItem, employee: WeWorkEmployee) => {
    team.pendingWorks = team.pendingWorks.filter((candidate) => candidate.id !== work.id);
    const assigned = { ...work, assignedEmployeeId: employee.id, status: employee.currentWorkItem ? 'pending' as const : 'running' as const };
    if (employee.currentWorkItem) employee.queuedWorkItems = [...(employee.queuedWorkItems ?? []), assigned];
    else { employee.currentWorkItem = assigned; employee.status = 'working'; }
    return assigned;
  };
  const reconcileWorkflow = (team: WeWorkTeam, workflowId = team.workflow?.id) => {
    const workflow = team.workflows?.find(candidate => candidate.id === workflowId) ?? (team.workflow?.id === workflowId ? team.workflow : undefined);
    if (!workflow) return;
    const completedByNode = new Map<string, WorkItem>();
    for (const employee of team.employees) for (const work of employee.completedWorkItems ?? []) {
      if (work.workflowId === workflow.id && work.workflowNodeId) completedByNode.set(work.workflowNodeId, work);
    }
    for (const node of workflow.nodes) {
      if (completedByNode.has(node.id)) {
        const work = completedByNode.get(node.id)!;
        const deliverable = work.records?.deliverables.at(-1);
        node.status = 'completed';
        node.outputDocumentIds = deliverable?.documentIds ?? [];
        if (node.outputPersistence === 'database') for (const documentId of deliverable?.documentIds ?? []) {
          const document = work.records?.documents.find((candidate) => candidate.id === documentId);
          if (!document) throw new Error('accepted DAG output document is missing');
          team.workflowDataRecords ??= [];
          if (!team.workflowDataRecords.some((record) => record.sourceDocumentId === document.id)) team.workflowDataRecords.push({
            id: identifier('workflow-data'), workflowId: workflow.id, nodeId: node.id, workId: work.id,
            sourceDocumentId: document.id, title: document.title, content: document.content, createdAt: now(),
          });
        }
      }
    }
    for (const node of workflow.nodes) {
      if (node.status === 'completed') continue;
      const work = team.pendingWorks.find((candidate) => candidate.workflowId === workflow.id && candidate.workflowNodeId === node.id);
      if (!work) continue;
      const dependencies = node.requires ?? [];
      if (!dependencies.every((id) => completedByNode.has(id))) {
        const missing = dependencies.filter((id) => !completedByNode.has(id)).map((id) => workflow.nodes.find((candidate) => candidate.id === id)?.label ?? id);
        node.status = 'waiting'; node.blockedReason = `等待上游：${missing.join('、')}`; work.status = 'blocked'; continue;
      }
      const bindings: NonNullable<typeof node.inputBindings> = node.inputBindings?.length ? node.inputBindings : dependencies.map((sourceNodeId) => ({ sourceNodeId, includeSummary: true }));
      const inputDocuments = bindings.flatMap((binding) => {
        const dependencyId = binding.sourceNodeId;
        const upstreamNode = workflow.nodes.find((candidate) => candidate.id === dependencyId)!;
        const upstreamWork = completedByNode.get(dependencyId)!;
        const deliverable = upstreamWork.records?.deliverables.at(-1);
        const selectedDocuments = (deliverable?.documentIds ?? []).flatMap((documentId) => {
          const document = upstreamWork.records?.documents.find((candidate) => candidate.id === documentId);
          if (!document) throw new Error('accepted DAG output document is missing');
          if (binding.documentTitles?.length && !binding.documentTitles.includes(document.title)) return [];
          if (!binding.documentTitles?.length) return [];
          return { upstreamNode, upstreamWork, document };
        });
        if (binding.includeSummary !== false && deliverable) selectedDocuments.push({ upstreamNode, upstreamWork, document: { id: `summary:${deliverable.id}`, title: '交付摘要', content: deliverable.summary, kind: 'output', revision: 1, createdAt: deliverable.createdAt } });
        return selectedDocuments;
      });
      work.records ??= { documents: [], progress: [], deliverables: [], reviews: [], audit: [] };
      for (const { upstreamNode, upstreamWork, document } of inputDocuments) {
        if (work.records.documents.some((candidate) => candidate.sourceDocumentId === document.id)) continue;
        work.records.documents.push({
          id: identifier('document'), title: `${upstreamNode.label} / ${document.title}`, content: document.content,
          kind: 'input', revision: 1, createdAt: now(), sourceWorkId: upstreamWork.id,
          sourceDocumentId: document.id, sourceNodeId: upstreamNode.id,
        });
      }
      node.inputDocumentIds = work.records.documents.filter((document) => document.kind === 'input').map((document) => document.id);
      work.status = 'pending';
      node.blockedReason = undefined;
      const employee = node.assignedEmployeeId ? team.employees.find((candidate) => candidate.id === node.assignedEmployeeId) : undefined;
      if (employee) {
        const assigned = assignPendingWork(team, work, employee);
        node.status = assigned.status === 'running' ? 'running' : 'ready';
      } else node.status = 'ready';
    }
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
      const state = read();
      // Project submitted outputs immediately without completing or releasing nodes.
      for (const team of state.teams) {
        const works = team.employees.flatMap(employee => [...(employee.currentWorkItem ? [employee.currentWorkItem] : []), ...(employee.completedWorkItems ?? [])]);
        for (const graph of [...(team.workflows ?? []), ...(team.workflow ? [team.workflow] : [])]) {
          for (const node of graph.nodes) {
            const work = works.find(candidate => candidate.id === node.workItemId);
            if (work) node.outputDocumentIds = work.records?.deliverables.at(-1)?.documentIds ?? [];
          }
        }
      }
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
    createTeam: async (input: { name: string; description?: string; leadName?: string; leadRole?: string; runtime?: WeWorkEmployee['runtime']; sessionExecution?: SessionExecution; workspaceAssignment?: WorkspaceAssignment; initializeLead?: boolean }) => mutate((state) => {
      const lead: WeWorkEmployee = {
        id: identifier('employee'), displayName: input.leadName?.trim() || randomEmployeeName(), roleName: input.leadRole || '团队负责人',
        color: randomEmployeeColor(), status: 'idle', runtime: input.runtime || 'Pi', isLead: true, builtInSkills: [clone(workflowLeadSkill)],
        activeSession: { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [] },
        artifacts: [], queuedWorkItems: [], completedWorkItems: [],
      };
      if (input.sessionExecution) lead.activeSession.execution = normalizeSessionExecution(input.sessionExecution);
      const employees = input.initializeLead === false ? [] : [lead];
      const team: WeWorkTeam = { weworkSessionId: identifier('wework'), workflowLeadSkillMigrated: true, id: identifier('team'), name: input.name, description: input.description || '', topology: 'roundTable', employees, pendingWorks: [], modules: normalizeTeamModules(undefined), workspaceAssignment: normalizeWorkspaceAssignment(input.workspaceAssignment) };
      state.teams.push(team);
      return team;
    }),
    configureTeamModules: async (teamId: string, input: TeamModuleRegistry) => mutate((state) => {
      const team = findTeam(state, teamId);
      team.modules = normalizeTeamModules(input);
      if (team.modules!.projectManagement.installed && !team.collaborationDatabase) team.collaborationDatabase = createCollaborationDatabase(now());
      return team;
    }),
    replaceCollaborationDatabase: async (teamId: string, input: unknown) => mutate((state) => {
      const team = findTeam(state, teamId);
      team.collaborationDatabase = normalizeCollaborationDatabase(input);
      return team.collaborationDatabase;
    }),
    createCollaborationWorkItem: async (teamId: string, input: Pick<CollaborationWorkItem, 'projectId' | 'title'> & Partial<Omit<CollaborationWorkItem, 'id' | 'projectId' | 'title' | 'createdAt' | 'updatedAt'>>) => mutate((state) => {
      const team = findTeam(state, teamId); const database = requireCapability(team, ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database']);
      if (!database.projects.some((project) => project.id === input.projectId) || !input.title?.trim()) throw new Error('invalid work item');
      const timestamp = now();
      const item: CollaborationWorkItem = { id: identifier('item'), projectId: input.projectId, title: input.title.trim(), description: input.description ?? '', statusId: input.statusId ?? database.statuses[0].id, priorityId: input.priorityId ?? database.priorities[1].id, labelIds: input.labelIds ?? [], assigneeIds: input.assigneeIds ?? [], cycleId: input.cycleId, milestoneId: input.milestoneId, startDate: input.startDate, dueDate: input.dueDate, createdAt: timestamp, updatedAt: timestamp };
      database.workItems.push(item); database.activities.push({ id: identifier('activity'), workItemId: item.id, action: 'work_item.created', createdAt: timestamp });
      return item;
    }),
    updateAssignedWorkItemStatus: async (teamId: string, workItemId: string, statusId: string, actor: { employeeId: string; runId: string }) => mutate((state) => {
      const team = findTeam(state, teamId);
      const database = requireCapability(team, ['board']);
      const item = database.workItems.find(candidate => candidate.id === workItemId);
      if (!item) throw new Error('work item not found');
      const assigned = database.assignees.some(assignee => assignee.employeeId === actor.employeeId && item.assigneeIds.includes(assignee.id));
      if (!team.employees.some(employee => employee.id === actor.employeeId) || !assigned) throw new Error('Only the assigned employee may update task status');
      if (!database.statuses.some(status => status.id === statusId)) throw new Error('invalid work item status');
      item.statusId = statusId;
      item.updatedAt = now();
      database.activities.push({ id: identifier('activity'), workItemId, actorId: actor.employeeId, action: 'work_item.status_updated', createdAt: item.updatedAt, details: { statusId, runId: actor.runId } });
      return item;
    }),
    updateCollaborationWorkItem: async (teamId: string, workItemId: string, patch: Partial<Pick<CollaborationWorkItem, 'title' | 'description' | 'statusId' | 'priorityId' | 'cycleId' | 'milestoneId' | 'labelIds' | 'assigneeIds' | 'startDate' | 'dueDate'>>) => mutate((state) => {
      const team = findTeam(state, teamId); const database = requireCapability(team, ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database']);
      const item = database.workItems.find((candidate) => candidate.id === workItemId); if (!item) throw new Error('work item not found');
      Object.assign(item, clone(patch), { updatedAt: now() });
      database.activities.push({ id: identifier('activity'), workItemId: item.id, action: 'work_item.updated', createdAt: item.updatedAt, details: clone(patch) });
      return item;
    }),
    deleteCollaborationWorkItem: async (teamId: string, workItemId: string) => mutate((state) => {
      const team = findTeam(state, teamId); const database = requireCapability(team, ['issues', 'board', 'gantt', 'timeline', 'calendar', 'database']);
      if (!database.workItems.some(item => item.id === workItemId)) throw new Error('work item not found');
      database.workItems = database.workItems.filter(item => item.id !== workItemId);
      database.relations = database.relations.filter(relation => relation.sourceWorkItemId !== workItemId && relation.targetWorkItemId !== workItemId);
      database.comments = database.comments.filter(comment => comment.workItemId !== workItemId);
      database.activities = database.activities.filter(activity => activity.workItemId !== workItemId);
      return { deleted: workItemId };
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
        id: identifier('employee'), displayName: input.displayName.trim() || randomEmployeeName(team.employees.map(employee => employee.displayName)), roleName: input.roleName, color: randomEmployeeColor(team.employees.map(employee => employee.color)), status: 'idle',
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
      team.completedWorks = [...(team.completedWorks ?? []), ...(employee.completedWorkItems ?? [])];
      for (const delivery of team.collaborationDeliveries ?? []) {
        if (delivery.employeeId === employeeId && delivery.status === 'queued') {
          delivery.status = 'cancelled'; delivery.error = '助手已移出团队'; delivery.updatedAt = now();
        }
      }
      const database = team.collaborationDatabase;
      if (database) {
        const removedIds = new Set([employeeId, ...database.assignees.filter(item => item.employeeId === employeeId).map(item => item.id)]);
        database.assignees = database.assignees.filter(item => item.employeeId !== employeeId);
        database.workItems.forEach(item => { item.assigneeIds = item.assigneeIds.filter(id => !removedIds.has(id)); });
      }
      team.workflow?.nodes.forEach(node => { if (node.assignedEmployeeId === employeeId) node.assignedEmployeeId = undefined; });
      team.employees = team.employees.filter((candidate) => candidate.id !== employeeId);
      return { deleted: employeeId };
    }),
    updateEmployee: async (employeeId: string, input: { displayName: string; roleName: string; runtime: WeWorkEmployee['runtime']; skills: SkillRef[]; defaultRuntimeProfileId?: string; workspaceAssignment?: WorkspaceAssignment; sessionExecution?: SessionExecution; sessionContextTagIds?: string[]; sessionPermissionMode?: 'ask' | 'auto' | 'full'; color?: string; startNewSession?: boolean }) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      if (input.color !== undefined) employee.color = validateEmployeeColor(input.color);
      Object.assign(employee, { displayName: input.displayName, roleName: input.roleName, runtime: input.runtime, builtInSkills: clone(input.skills), defaultRuntimeProfileId: input.defaultRuntimeProfileId, workspaceAssignment: normalizeWorkspaceAssignment(input.workspaceAssignment) });
      if (input.sessionContextTagIds) employee.activeSession.contextTagIds = [...new Set(input.sessionContextTagIds.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
      if (input.sessionPermissionMode !== undefined) {
        if (!['ask', 'auto', 'full'].includes(input.sessionPermissionMode)) throw new Error('invalid Session permission mode');
        employee.activeSession.permissionMode = input.sessionPermissionMode;
      }
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
        if (changesHarness && hasContext && input.startNewSession) { (employee.sessionHistory ??= []).unshift(clone(employee.activeSession)); employee.activeSession = { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [], contextTagIds: employee.activeSession.contextTagIds, permissionMode: input.sessionPermissionMode ?? employee.activeSession.permissionMode, execution: sessionExecution }; }
        else employee.activeSession.execution = sessionExecution;
      } else {
        const profile = state.runtimeProfiles.find((candidate) => candidate.id === input.defaultRuntimeProfileId);
        if (profile && employee.activeSession.execution?.sourceProfileId !== profile.id) employee.activeSession.execution = sessionExecutionFromProfile(profile);
      }
      return employee;
    }),
    resetEmployeeContext: async (employeeId: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      if (employee.activeSession.messages.length) (employee.sessionHistory ??= []).unshift(clone(employee.activeSession));
      employee.activeSession = { id: identifier('session'), contextRatio: 0, updatedAt: now(), messages: [], metrics: [], execution: employee.activeSession.execution, contextTagIds: employee.activeSession.contextTagIds, permissionMode: employee.activeSession.permissionMode };
      return employee;
    }),
    setLead: async (teamId: string, employeeId: string) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team?.employees.some((employee) => employee.id === employeeId)) throw new Error('employee not found');
      team.employees.forEach((employee) => { employee.isLead = employee.id === employeeId; });
      const lead = team.employees.find((employee) => employee.id === employeeId)!;
      if (!lead.builtInSkills.some((skill) => skill.id === workflowLeadSkill.id)) lead.builtInSkills.push(clone(workflowLeadSkill));
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
      if (employee.runtime === 'Pi' && !(employee.activeSession.execution?.adapter === 'pi' && employee.activeSession.execution.enabled) && !employee.defaultRuntimeProfileId && !located.work.runtimeProfileId && !employeeTeam.defaultRuntimeProfileId) {
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
      const workflowNode = (located.team.workflows ?? (located.team.workflow ? [located.team.workflow] : [])).find(flow => flow.id === located.work.workflowId)?.nodes.find(node => node.workItemId === workId);
      if (workflowNode) { workflowNode.status = 'blocked'; workflowNode.blockedReason = '关联工作项已取消'; }
      return located.work;
    }),
    completeCurrent: async (employeeId: string) => mutate((state) => {
      const { team, employee } = findEmployee(state, employeeId);
      if (!employee.currentWorkItem) throw new Error('employee has no running work');
      const workflowWork = Boolean(employee.currentWorkItem.workflowNodeId);
      if (!(workflowWork ? submittedDeliverable(employee.currentWorkItem) : acceptedDeliverable(employee.currentWorkItem))) throw new Error(workflowWork ? 'a submitted deliverable is required before DAG progression' : 'an accepted deliverable is required before completion');
      const completed = { ...employee.currentWorkItem, status: 'completed' as const };
      employee.completedWorkItems = [...(employee.completedWorkItems ?? []), completed];
      promoteNext(employee);
      reconcileWorkflow(team, completed.workflowId);
      return completed;
    }),
    returnCurrent: async (employeeId: string) => mutate((state) => {
      const { team, employee } = findEmployee(state, employeeId);
      if (!employee.currentWorkItem) throw new Error('employee has no running work');
      const returned = { ...employee.currentWorkItem, status: 'pending' as const, assignedEmployeeId: undefined };
      team.pendingWorks.push(returned);
      promoteNext(employee);
      const workflowNode = (team.workflows ?? (team.workflow ? [team.workflow] : [])).find(flow => flow.id === returned.workflowId)?.nodes.find(node => node.workItemId === returned.id);
      if (workflowNode) { workflowNode.status = 'ready'; workflowNode.blockedReason = '工作项已退回，等待重新指派'; }
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
      if (team.workflow?.nodes.some((node) => node.workItemId)) {
        const executionShape = (value: WorkflowTemplate) => value.nodes.map((node) => ({
          id: node.id, label: node.label, roleName: node.roleName, goal: node.goal ?? '', constraints: node.constraints ?? '',
          acceptanceCriteria: node.acceptanceCriteria ?? '', inputRequirements: node.inputRequirements ?? '', outputRequirements: node.outputRequirements ?? '',
          outputPersistence: node.outputPersistence ?? 'handoff', assignedEmployeeId: node.assignedEmployeeId ?? '', requires: node.requires ?? [], workItemId: node.workItemId ?? '',
        }));
        if (JSON.stringify(executionShape(team.workflow)) !== JSON.stringify(executionShape(workflow))) throw new Error('running workflow structure is read-only');
      }
      const saved = { ...clone(workflow), version: (team.workflow?.version ?? 0) + 1 };
      team.workflow = saved;
      team.activeWorkflowId = saved.id;
      team.workflows = [...(team.workflows ?? []).filter((candidate) => candidate.id !== saved.id), saved];
      return saved;
    }),
    createWorkflow: async (teamId: string, input: { name: string; description?: string; temporary?: boolean; workType?: string; workTypeId?: string; leadEmployeeId?: string; participantEmployeeIds?: string[]; sourceWorkflowId?: string; workId?: string }) => mutate((state) => {
      const team = findTeam(state, teamId);
      if (!input.name?.trim()) throw new Error('workflow name is required');
      const members = new Set(team.employees.map((employee) => employee.id));
      if (input.leadEmployeeId && !members.has(input.leadEmployeeId)) throw new Error('workflow lead is not a team member');
      if (input.participantEmployeeIds?.some((id) => !members.has(id))) throw new Error('workflow participant is not a team member');
      const source = input.sourceWorkflowId ? team.workflows?.find((workflow) => workflow.id === input.sourceWorkflowId) : undefined;
      if (input.sourceWorkflowId && !source) throw new Error('workflow reference not found');
      const workType = input.workTypeId ? team.workTypes?.find((candidate) => candidate.id === input.workTypeId) : undefined;
      if (input.workTypeId && !workType) throw new Error('work type not found');
      const linkedWork = input.workId ? findWork(state, input.workId) : undefined;
      if (linkedWork && linkedWork.team.id !== team.id) throw new Error('workflow task is not in this team');
      if (linkedWork?.work.dagWorkflowId || (input.workId && team.workflows?.some((candidate) => candidate.workId === input.workId))) throw new Error('task already has a DAG');
      const workflow: WorkflowTemplate = {
        id: identifier('workflow'), name: input.name.trim(), description: input.description?.trim() ?? source?.description ?? '',
        nodes: source ? source.nodes.map((node) => ({ ...clone(node), workItemId: undefined, inputDocumentIds: [], outputDocumentIds: [], status: 'ready', blockedReason: undefined })) : [],
        version: 0, temporary: input.temporary === true, workType: workType?.name ?? (input.workType?.trim() || source?.workType), workTypeId: workType?.id ?? source?.workTypeId,
        leadEmployeeId: input.leadEmployeeId ?? workType?.leadEmployeeId, participantEmployeeIds: [...new Set(input.participantEmployeeIds ?? workType?.participantEmployeeIds ?? (input.leadEmployeeId ? [input.leadEmployeeId] : []))], sourceWorkflowId: source?.id,
        contextTagId: workType?.contextTagId ?? (input.workType?.trim() ? `work-type:${input.workType.trim()}`.slice(0, 60) : source?.contextTagId),
        workId: linkedWork?.work.id,
      };
      if (linkedWork) linkedWork.work.dagWorkflowId = workflow.id;
      team.workflows = [...(team.workflows ?? []), workflow];
      team.activeWorkflowId = workflow.id;
      team.workflow = workflow;
      return workflow;
    }),
    listWorkflowReferences: async (teamId: string, workType: string) => {
      const team = findTeam(read(), teamId);
      const normalized = workType.trim();
      if (!normalized) throw new Error('work type is required');
      return clone((team.workflows ?? []).filter((workflow) => !workflow.temporary && (workflow.workTypeId === normalized || workflow.workType === normalized)));
    },
    configureWorkType: async (teamId: string, input: { id: string; name: string; leadEmployeeId?: string; participantEmployeeIds: string[]; assignmentPolicy: 'balanced' | 'manual'; assignmentWeights?: Record<string, number> }) => mutate((state) => {
      const team = findTeam(state, teamId), members = new Set(team.employees.map((employee) => employee.id));
      if (!safeIdentifier.test(input.id) || !input.name?.trim() || !['balanced', 'manual'].includes(input.assignmentPolicy) || !Array.isArray(input.participantEmployeeIds) || input.participantEmployeeIds.some((id) => !members.has(id)) || (input.leadEmployeeId && !members.has(input.leadEmployeeId))) throw new Error('invalid work type');
      const assignmentWeights = Object.fromEntries(Object.entries(input.assignmentWeights ?? {}).map(([id, weight]) => {
        if (!members.has(id) || !Number.isFinite(weight) || weight <= 0) throw new Error('invalid assignment weight');
        return [id, weight];
      }));
      const workType = { ...clone(input), name: input.name.trim(), participantEmployeeIds: [...new Set(input.participantEmployeeIds)], assignmentWeights, contextTagId: `work-type:${input.id}` };
      team.workTypes = [...(team.workTypes ?? []).filter((candidate) => candidate.id !== input.id), workType];
      return workType;
    }),
    selectWorkflow: async (teamId: string, workflowId: string) => mutate((state) => {
      const team = findTeam(state, teamId);
      const workflow = team.workflows?.find((candidate) => candidate.id === workflowId);
      if (!workflow) throw new Error('workflow not found');
      team.activeWorkflowId = workflow.id;
      team.workflow = workflow;
      return workflow;
    }),
    startWorkflow: async (teamId: string) => mutate((state) => {
      const team = findTeam(state, teamId);
      const workflow = team.workflow;
      if (!workflow) throw new Error('workflow not found');
      if (workflow.nodes.some((node) => node.workItemId)) throw new Error('workflow has already started');
      const nodeIds = new Set(workflow.nodes.map((node) => node.id));
      if (nodeIds.size !== workflow.nodes.length || workflow.nodes.some((node) => (node.requires ?? []).some((id) => !nodeIds.has(id)))) throw new Error('invalid workflow dependencies');
      const visiting = new Set<string>(), visited = new Set<string>();
      const visit = (id: string) => {
        if (visiting.has(id)) throw new Error('workflow contains a cycle');
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dependency of workflow.nodes.find((node) => node.id === id)?.requires ?? []) visit(dependency);
        visiting.delete(id); visited.add(id);
      };
      workflow.nodes.forEach((node) => visit(node.id));
      const workType = workflow.workTypeId ? team.workTypes?.find((candidate) => candidate.id === workflow.workTypeId) : undefined;
      if (workType?.assignmentPolicy === 'balanced') for (const node of workflow.nodes) if (!node.assignedEmployeeId) {
        const candidates = team.employees.filter((employee) => workType.participantEmployeeIds.includes(employee.id));
        const load = (employee: WeWorkEmployee) => (employee.currentWorkItem ? 1 : 0) + (employee.queuedWorkItems?.length ?? 0);
        const selected = candidates.sort((a, b) => load(a) / (workType.assignmentWeights?.[a.id] ?? 1) - load(b) / (workType.assignmentWeights?.[b.id] ?? 1))[0];
        if (selected) node.assignedEmployeeId = selected.id;
      }
      for (const node of workflow.nodes) {
        const work: WorkItem = {
          id: identifier('work'), title: node.label, goal: node.goal?.trim() || node.label,
          constraints: [node.constraints, node.inputRequirements ? `输入要求：${node.inputRequirements}` : ''].filter(Boolean).join('\n') || undefined,
          acceptanceCriteria: [node.acceptanceCriteria, node.outputRequirements ? `输出要求：${node.outputRequirements}` : ''].filter(Boolean).join('\n') || undefined,
          status: (node.requires?.length ?? 0) > 0 ? 'blocked' : 'pending', priority: 'medium', category: 'Digital',
          createdAt: now(), workflowId: workflow.id, workflowNodeId: node.id,
          contextTagIds: workflow.contextTagId ? [workflow.contextTagId] : [],
          records: { documents: [], progress: [], deliverables: [], reviews: [], audit: [] },
        };
        node.workItemId = work.id;
        node.inputDocumentIds = [];
        node.outputDocumentIds = [];
        node.status = (node.requires?.length ?? 0) > 0 ? 'waiting' : 'ready';
        team.pendingWorks.push(work);
      }
      reconcileWorkflow(team);
      return workflow;
    }),
    ensureWorkSession: async (employeeId: string, workId: string) => mutate(state => {
      const {employee, team} = findEmployee(state, employeeId);
      return ensureWorkbenchSession(employee, team, workId);
    }),
    ensureConversation: async (employeeId: string, tabId: string) => mutate(state => {
      const {employee, team} = findEmployee(state, employeeId);
      return ensureWorkbenchSession(employee, team, tabId);
    }),
    setSessionActivity: async (employeeId: string, sessionId: string, activity: {state:'idle'|'working'|'waiting'|'error';detail:string;runId?:string}) => mutate(state => {
      const {employee} = findEmployee(state, employeeId);
      const session = employeeSessions(employee).find(session => session.id === sessionId);
      if (session) { session.activity = activity; session.updatedAt = now(); }
    }),
    sendMessage: async (employeeId: string, text: string, tabId = 'private') => mutate((state) => {
      const { employee, team } = findEmployee(state, employeeId);
      const session = ensureWorkbenchSession(employee, team, tabId);
      const message = { id: identifier('message'), sender: 'user' as const, text, time: now() };
      session.messages.push(message);
      session.updatedAt = now();
      return message;
    }),
    appendRuntimeEvents: async (employeeId: string, sessionId: string, runId: string, events: {sequence: number; type: string; text?: string; activity?: string}[]) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      const session = employeeSessions(employee).find(session => session.id === sessionId);
      if (!session) return;
      const messages = session.messages;
      let seen = messages.reduce((sequence, message) => message.runtimeRunId === runId ? Math.max(sequence, message.runtimeSequence ?? 0) : sequence, 0);
      for (const event of events) {
        if (event.sequence <= seen || !event.text) continue;
        const kind = event.type === 'assistant.delta' ? 'text' : event.activity ?? 'status';
        const label = kind === 'thinking' ? '思考 · ' : kind === 'tool' ? '工具 · ' : kind === 'text' ? '' : '状态 · ';
        const last = messages.at(-1);
        if (last?.runtimeRunId === runId && last.runtimeKind === kind && ['text', 'thinking'].includes(kind)) {
          last.text += event.text; last.runtimeSequence = event.sequence;
        } else messages.push({ id: `runtime-${runId}-${event.sequence}`, sender: kind === 'text' ? 'employee' : 'system', senderName: employee.displayName, text: label + event.text, time: now(), runtimeRunId: runId, runtimeSequence: event.sequence, runtimeKind: kind });
        seen = event.sequence;
      }
      session.updatedAt = now();
    }),
    sendAssistantMessage: async (employeeId: string, text: string, sessionId?: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      const session = sessionId ? employeeSessions(employee).find(session => session.id === sessionId) : employee.activeSession;
      if (!session) return;
      const message: MessageItem = { id: identifier('message'), sender: 'employee', senderName: employee.displayName, text, time: now() };
      session.messages.push(message);
      session.updatedAt = now();
      return message;
    }),
    acknowledgeEmployeeError: async (employeeId: string, observedKey: string) => mutate(snapshot => {
      const { employee, team } = findEmployee(snapshot, employeeId);
      if (employeeErrorKey(employee, team.collaborationDeliveries) === observedKey) employee.acknowledgedErrorKey = observedKey;
      return { acknowledged: employee.acknowledgedErrorKey === observedKey };
    }),
    setEmployeeActivity: async (employeeId: string, state: 'idle'|'working'|'waiting'|'error', detail: string, runId?: string) => mutate(snapshot => {
      const {employee} = findEmployee(snapshot, employeeId);
      employee.executionActivity = {state,detail,runId,updatedAt:now()};
    }),
    clearSessionContextMeasurement: async (employeeId: string) => mutate(state => {
      const {employee} = findEmployee(state, employeeId);
      employee.activeSession.contextMeasuredAt = undefined;
      employee.activeSession.contextRatio = 0;
      employee.activeSession.metrics = [];
    }),
    updateSessionContextUsage: async (employeeId: string, usage: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; context: { tokens: number; effectiveLimit: number; percent: number } }, sessionId?: string) => mutate((state) => {
      const { employee } = findEmployee(state, employeeId);
      const session = sessionId ? employeeSessions(employee).find(session => session.id === sessionId) : employee.activeSession;
      if (!session) return;
      const context = usage?.context;
      if (!context || !Number.isFinite(context.tokens) || context.tokens < 0 || !Number.isFinite(context.effectiveLimit) || context.effectiveLimit <= 0 || !Number.isFinite(context.percent)) throw new Error('invalid Session Context usage');
      const maximum = context.effectiveLimit;
      const metric = (label: string, value: unknown) => Number.isFinite(value) && Number(value) >= 0 ? { label, value: Number(value), maximum, unit: 'tokens' } : undefined;
      session.contextRatio = Math.max(0, Math.min(100, context.percent));
      session.contextMeasuredAt = now();
      session.metrics = [
        metric('Context tokens', context.tokens), metric('Input tokens', usage.input), metric('Output tokens', usage.output),
        metric('Cache read', usage.cacheRead), metric('Cache write', usage.cacheWrite),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item));
      session.updatedAt = now();
      return clone(employee.activeSession);
    }),
    recordGroupSteering: async (teamId: string, deliveryId: string, text: string) => mutate(state => {
      const team = state.teams.find(team => team.id === teamId);
      const delivery = team?.collaborationDeliveries?.find(delivery => delivery.id === deliveryId);
      if (!team || !delivery || typeof text !== 'string' || !text.trim()) throw new Error('invalid group steering');
      const source = team.teamMessages?.find(message => message.id === delivery.messageId);
      const message: MessageItem = {id:identifier('steering'),sender:'user',senderName:'你',text, time:now(),recipientId:delivery.employeeId,replyToMessageId:delivery.messageId,sourceRunId:delivery.runId,contextTagIds:source?.contextTagIds ?? []};
      (team.teamMessages ??= []).push(message);
      return message;
    }),
    sendTeamMessage: async (teamId: string, text: string, actor?: { employeeId: string; runId: string }, contextTagIds?: string[]) => mutate((state) => {
      const team = state.teams.find((candidate) => candidate.id === teamId);
      if (!team) throw new Error('team not found');
      if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('invalid team message');
      const author = actor ? team.employees.find((employee) => employee.id === actor.employeeId) : undefined;
      if (actor && !author) throw new Error('team message actor is not a member');
      const message: MessageItem = { id: identifier('team-message'), broadcast: true, sender: author ? 'employee' : 'user', senderName: author?.displayName ?? '你', text, time: now(), sourceRunId: actor?.runId, contextTagIds: [...new Set((contextTagIds ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20) };
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
