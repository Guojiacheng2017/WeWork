import { create } from 'zustand';
import { WeWorkTeam, WeWorkEmployee, WorkItem, TeamView, RoleNode, RuntimeProfile, SessionExecution, WorkflowTemplate, WorkspaceAssignment } from '../domain/wework';
import { hostManagedWeWork, localWeWorkApi, weworkApi, weworkMode } from '../api/weworkApi';
import { publishGroupMessage } from '../runtime/groupMessaging';
import { LocalRunScheduler } from '../runtime/localRunScheduler';
import { LoopbackRuntimeEvents, weworkHost, type RuntimeEvent } from '../runtime/weworkHost';
import type { CollaborationWorkItem, ProjectCapability, TeamModuleRegistry } from '../domain/collaboration';

const runtimeCapableHost = 'startRun' in weworkHost ? weworkHost : null;
const runScheduler = runtimeCapableHost ? new LocalRunScheduler({ wework: weworkApi, host: runtimeCapableHost, managedWeWork: hostManagedWeWork, storage: window.localStorage }) : null;
const runtimeEvents = runtimeCapableHost ? new LoopbackRuntimeEvents(runtimeCapableHost) : null;
const restoreWorkspacePreference = () => window.localStorage.getItem('wework.restoreTeams') !== 'false';
const readViewModePreference = (): WeWorkState['viewMode'] => window.localStorage.getItem('wework.lastViewMode') === 'eyeLevel' ? 'eyeLevel' : 'topDown';
const readTopologyPreference = (): TeamView | null => {
  const value = window.localStorage.getItem('wework.lastTopology');
  return value === 'roundTable' || value === 'workflowDag' || value === 'teamManagement' || value === 'issues' || value === 'board' || value === 'gantt' ? value : null;
};
const availableTopology = (team: WeWorkTeam | undefined, preferred: TeamView): TeamView => {
  if (preferred === 'roundTable' || preferred === 'teamManagement') return preferred;
  const capabilities = team?.modules?.projectManagement.enabled ? team.modules.projectManagement.capabilities : [];
  const required: ProjectCapability = preferred === 'workflowDag' ? 'dag' : preferred;
  return capabilities.includes(required) ? preferred : 'roundTable';
};

interface WeWorkState {
  teams: WeWorkTeam[];
  archivedTeams: WeWorkTeam[];
  runtimeProfiles: RuntimeProfile[];
  selectedTeamId: string;
  selectedEmployeeId: string | null;
  viewMode: 'topDown' | 'eyeLevel';
  topology: TeamView;
  draggingWorkItemId: string | null;
  dragHoveredEmployeeId: string | null;
  isWorkbenchOpen: boolean;
  isCreateTeamOpen: boolean;
  isAddEmployeeOpen: boolean;
  isRuntimeProfileOpen: boolean;
  settingsSection: 'general' | 'execution' | 'storage' | 'about';
  serviceStatus: 'loading' | 'ready' | 'error';
  serviceError: string | null;
  weworkMode: 'local' | 'remote';
  eventCursor: number;

  // Actions
  selectTeam: (teamId: string) => void;
  selectEmployee: (employeeId: string | null) => void;
  setViewMode: (mode: 'topDown' | 'eyeLevel') => void;
  setTopology: (topology: TeamView) => void;
  setDraggingWorkItemId: (id: string | null) => void;
  setDragHoveredEmployeeId: (employeeId: string | null) => void;
  openWorkbench: (employeeId?: string) => void;
  closeWorkbench: () => void;
  setCreateTeamOpen: (open: boolean) => void;
  setAddEmployeeOpen: (open: boolean) => void;
  setRuntimeProfileOpen: (open: boolean, employeeId?: string, section?: WeWorkState['settingsSection']) => void;
  dispatchWorkToEmployee: (workItemId: string, targetEmployeeId: string) => void;
  createWorkItem: (input: Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category' | 'runtimeProfileId'>) => void;
  updateWorkItem: (workId: string, input: Partial<Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category'>>) => Promise<void>;
  completeCurrentWork: (employeeId: string) => void;
  returnCurrentWork: (employeeId: string) => void;
  cancelWork: (workId: string) => Promise<void>;
  createTeam: (name: string, description: string, workspaceAssignment?: WorkspaceAssignment) => Promise<void>;
  archiveTeam: (teamId: string) => Promise<void>;
  restoreTeam: (teamId: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  updateTeamWorkspace: (teamId: string, workspaceAssignment?: WorkspaceAssignment) => Promise<void>;
  addEmployee: (teamId: string, displayName: string, roleName: string, runtime: 'Pi' | 'Claude Code' | 'DSH' | 'Workspace', sessionExecution: SessionExecution) => Promise<void>;
  removeEmployee: (teamId: string, employeeId: string) => void;
  updateEmployee: (employeeId: string, input: { displayName: string; roleName: string; runtime: WeWorkEmployee['runtime']; skills: WeWorkEmployee['builtInSkills']; defaultRuntimeProfileId?: string; workspaceAssignment?: WorkspaceAssignment; sessionExecution?: SessionExecution; sessionContextTagIds?: string[]; startNewSession?: boolean }) => Promise<void>;
  createRuntimeProfile: (input: Omit<RuntimeProfile, 'id' | 'createdAt' | 'updatedAt'>) => Promise<RuntimeProfile | undefined>;
  resetEmployeeContext: (employeeId: string) => Promise<void>;
  setTeamLead: (teamId: string, employeeId: string) => void;
  saveWorkflow: (teamId: string, workflow: WorkflowTemplate) => Promise<void>;
  addWorkflowNode: (teamId: string, position?: { x: number; y: number }) => string;
  updateWorkflowNode: (teamId: string, nodeId: string, patch: Partial<RoleNode>) => void;
  removeWorkflowNode: (teamId: string, nodeId: string) => void;
  sendWorkbenchMessage: (employeeId: string, text: string) => void;
  sendTeamMessage: (teamId: string, text: string, recipientId?: string, contextTagIds?: string[]) => Promise<void>;
  cancelGroupDelivery: (teamId:string,deliveryId:string)=>Promise<void>;
  configureTeamModules: (teamId: string, modules: TeamModuleRegistry) => Promise<void>;
  syncPlaneProject: (teamId: string) => Promise<void>;
  createProjectWorkItem: (teamId: string, title: string) => Promise<void>;
  updateProjectWorkItem: (teamId: string, workItemId: string, patch: Partial<CollaborationWorkItem>) => Promise<void>;
  deleteProjectData: (teamId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  connectEvents: () => () => void;
  connectRuntime: () => () => void;
}

const hasWorkflowCycle = (nodes: RoleNode[]) => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const node = nodes.find((item) => item.id === id);
    if ((node?.requires ?? []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
};

const reportError = (set: (patch: Partial<WeWorkState>) => void, error: unknown) =>
  set({ serviceStatus: 'error', serviceError: error instanceof Error ? error.message : String(error) });

const applyRuntimeTerminal = async (employeeId: string, status: string, get: () => WeWorkState) => {
  const employee = get().teams.flatMap((team) => team.employees).find((employee) => employee.id === employeeId);
  if (!employee?.currentWorkItem) return;
  if (weworkMode === 'local') return; // Execution outcome is not delivery acceptance.
  if (status === 'succeeded') await weworkApi.completeCurrent(employeeId);
  else await weworkApi.cancelWork(employee.currentWorkItem.id);
};

export const useWeWorkStore = create<WeWorkState>()((set, get) => ({
  teams: [],
  archivedTeams: [],
  runtimeProfiles: [],
  selectedTeamId: '',
  selectedEmployeeId: null,
  viewMode: 'topDown',
  topology: 'roundTable',
  draggingWorkItemId: null,
  dragHoveredEmployeeId: null,
  isWorkbenchOpen: false,
  isCreateTeamOpen: false,
  isAddEmployeeOpen: false,
  isRuntimeProfileOpen: false,
  settingsSection: 'general',
  serviceStatus: 'loading',
  serviceError: null,
  weworkMode,
  eventCursor: 0,

  hydrate: async () => {
    try {
      const [snapshot, runtimeProfileResult] = await Promise.all([weworkApi.snapshot({ includeArchived: true }), weworkApi.listRuntimeProfiles()]);
      const activeTeams = snapshot.teams.filter((team) => !team.archivedAt);
      const archivedTeams = snapshot.teams.filter((team) => team.archivedAt);
      const restoreWorkspace = restoreWorkspacePreference();
      const preferredTeamId = restoreWorkspace ? (get().selectedTeamId || window.localStorage.getItem('wework.lastTeamId') || '') : '';
      const selectedTeam = activeTeams.find((team) => team.id === preferredTeamId) || activeTeams[0];
      const selectedEmployee = selectedTeam?.employees.find((employee) => employee.id === get().selectedEmployeeId) || selectedTeam?.employees[0];
      const currentTopology = availableTopology(selectedTeam, restoreWorkspace ? (readTopologyPreference() ?? get().topology) : selectedTeam?.topology || 'roundTable');
      set({ teams: activeTeams, archivedTeams, runtimeProfiles: runtimeProfileResult.profiles, selectedTeamId: selectedTeam?.id || '', selectedEmployeeId: selectedEmployee?.id || null,
        viewMode: restoreWorkspace ? readViewModePreference() : 'topDown', topology: currentTopology, eventCursor: snapshot.eventCursor,
        serviceStatus: 'ready', serviceError: null });
      if (runScheduler) {
        const recovered = await runScheduler.recover();
        for (const run of recovered) await applyRuntimeTerminal(run.employeeId, run.status, get);
      }
    } catch (error) { reportError(set, error); }
  },

  connectEvents: () => {
    const source = weworkApi.eventSource(get().eventCursor);
    source.addEventListener('wework', (message) => {
      try {
        const event = JSON.parse((message as MessageEvent<string>).data) as {
          id: number;
          type: string;
          payload?: { teamId?: string; version?: number };
        };
        set({ eventCursor: event.id, serviceStatus: 'ready', serviceError: null });
        if (event.type === 'workflow.saved' && event.payload?.teamId && event.payload.version !== undefined) {
          const localVersion = get().teams.find((team) => team.id === event.payload?.teamId)?.workflow?.version ?? 0;
          if (event.payload.version > localVersion) {
            void weworkApi.getWorkflow(event.payload.teamId).then((workflow) => set((state) => ({
              teams: state.teams.map((team) => team.id === event.payload?.teamId ? { ...team, workflow } : team),
            }))).catch((error) => reportError(set, error));
          }
          return;
        }
        void get().hydrate();
      } catch (error) { reportError(set, error); }
    });
    source.onerror = () => {
      if (weworkMode === 'remote') set({ serviceStatus: 'error', serviceError: '协作同步连接已断开，正在等待重连' });
    };
    return () => source.close();
  },

  connectRuntime: () => runtimeEvents?.subscribe((event: RuntimeEvent) => {
    if (event.type === 'wework.updated') { void get().hydrate(); return; }
    const employeeId = 'runId' in event ? runScheduler?.employeeForRun(event.runId) : undefined;
    if (!employeeId) return;
    if (event.type === 'assistant.delta') {
      set((state) => ({ teams: state.teams.map((team) => ({ ...team, employees: team.employees.map((employee) => {
        if (employee.id !== employeeId) return employee;
        const messageId = `runtime-${event.runId}`;
        const existing = employee.activeSession.messages.find((message) => message.id === messageId);
        const messages = existing
          ? employee.activeSession.messages.map((message) => message.id === messageId ? { ...message, text: message.text + event.text } : message)
          : [...employee.activeSession.messages, { id: messageId, sender: 'employee' as const, senderName: employee.displayName, text: event.text, time: '刚刚' }];
        return { ...employee, activeSession: { ...employee.activeSession, updatedAt: '刚刚', messages } };
      }) })) }));
      return;
    }
    if (event.type === 'assistant.activity') {
      set((state) => ({ teams: state.teams.map((team) => ({ ...team, employees: team.employees.map((employee) => {
        if (employee.id !== employeeId) return employee;
        const label = event.activity === 'thinking' ? '思考' : event.activity === 'tool' ? '工具' : '状态';
        const messageId = event.activity === 'thinking'
          ? `runtime-${event.runId}-thinking`
          : `runtime-${event.runId}-${event.activity}-${employee.activeSession.messages.length}`;
        const existing = employee.activeSession.messages.find((message) => message.id === messageId);
        const messages = existing
          ? employee.activeSession.messages.map((message) => message.id === messageId ? { ...message, text: `${label} · ${message.text.slice(label.length + 3)}${event.text}` } : message)
          : [...employee.activeSession.messages, { id: messageId, sender: 'system' as const, senderName: employee.displayName, text: `${label} · ${event.text}`, time: '刚刚' }];
        return { ...employee, activeSession: { ...employee.activeSession, updatedAt: '刚刚', messages } };
      }) })) }));
      return;
    }
    if (['run.succeeded', 'run.failed', 'run.cancelled'].includes(event.type)) {
      if (hostManagedWeWork) {
        runScheduler?.markTerminal(employeeId);
        void get().hydrate();
        if (event.type !== 'run.succeeded') reportError(set, new Error(('error' in event ? event.error : undefined) ?? 'Execution cancelled'));
        return;
      }
      const promptRun = runScheduler?.isPromptRun(event.runId);
      if (promptRun) {
        if (event.type === 'run.succeeded') {
          void weworkApi.sendAssistantMessage(employeeId, event.finalText).then(() => { runScheduler?.markTerminal(employeeId); return get().hydrate(); }).catch((error) => reportError(set, error));
        } else {
          runScheduler?.markTerminal(employeeId);
          reportError(set, new Error(event.type === 'run.failed' ? event.error : 'Runtime run cancelled'));
        }
        return;
      }
      runScheduler?.markTerminal(employeeId);
      void applyRuntimeTerminal(employeeId, event.type.slice(4), get).then(() => get().hydrate()).catch((error) => reportError(set, error));
    }
  }) ?? (() => {}),

  selectTeam: (teamId) => {
    const team = get().teams.find((t) => t.id === teamId);
    set({
      selectedTeamId: teamId,
      selectedEmployeeId: team && team.employees.length > 0 ? team.employees[0].id : null,
      topology: availableTopology(team, team?.topology || 'roundTable'),
      isWorkbenchOpen: false,
    });
    window.localStorage.setItem('wework.lastTeamId', teamId);
    window.localStorage.setItem('wework.lastTopology', team?.topology || 'roundTable');
  },

  selectEmployee: (employeeId) => set({ selectedEmployeeId: employeeId }),
  setViewMode: (viewMode) => { window.localStorage.setItem('wework.lastViewMode', viewMode); set({ viewMode }); },
  setTopology: (topology) => { window.localStorage.setItem('wework.lastTopology', topology); set({ topology }); },
  configureTeamModules: async (teamId, modules) => { try { await weworkApi.configureTeamModules(teamId, modules); await get().hydrate(); } catch (error) { reportError(set, error); throw error; } },
  syncPlaneProject: async () => {},
  createProjectWorkItem: async (teamId, title) => { try { await weworkApi.createCollaborationWorkItem(teamId, { projectId: 'project-main', title }); await get().hydrate(); } catch (error) { reportError(set, error); throw error; } },
  updateProjectWorkItem: async (teamId, workItemId, patch) => { try { await weworkApi.updateCollaborationWorkItem(teamId, workItemId, patch); await get().hydrate(); } catch (error) { reportError(set, error); throw error; } },
  deleteProjectData: async (teamId) => { try { await weworkApi.deleteCollaborationDatabase(teamId, { confirm: true }); set({ topology: 'roundTable' }); await get().hydrate(); } catch (error) { reportError(set, error); throw error; } },
  setDraggingWorkItemId: (draggingWorkItemId) => set({ draggingWorkItemId }),
  setDragHoveredEmployeeId: (dragHoveredEmployeeId) => set({ dragHoveredEmployeeId }),

  openWorkbench: (employeeId) => {
    if (employeeId) {
      set({ selectedEmployeeId: employeeId, isWorkbenchOpen: true });
    } else {
      set({ isWorkbenchOpen: true });
    }
  },

  closeWorkbench: () => set({ isWorkbenchOpen: false }),
  setCreateTeamOpen: (open) => set({ isCreateTeamOpen: open }),
  setAddEmployeeOpen: (open) => set({ isAddEmployeeOpen: open }),
  setRuntimeProfileOpen: (open, employeeId, section) => set((state) => ({
    isRuntimeProfileOpen: open,
    settingsSection: section ?? (employeeId ? 'execution' : state.settingsSection),
    selectedEmployeeId: employeeId ?? state.selectedEmployeeId,
  })),

  dispatchWorkToEmployee: (workItemId, targetEmployeeId) => {
    set({ draggingWorkItemId: null, dragHoveredEmployeeId: null });
    void weworkApi.assignWork(workItemId, targetEmployeeId).then(async () => { await get().hydrate(); if (runScheduler) await runScheduler.startCurrentWork(targetEmployeeId); }).catch(async (error) => {
      await get().hydrate();
      reportError(set, error);
    });
  },

  createWorkItem: (input) => {
    const teamId = get().selectedTeamId;
    void weworkApi.createWork(teamId, input).then(() => get().hydrate()).catch((error) => reportError(set, error));
  },

  completeCurrentWork: (employeeId) => {
    void weworkApi.completeCurrent(employeeId).then(() => get().hydrate()).catch((error) => reportError(set, error));
  },

  returnCurrentWork: (employeeId) => {
    void weworkApi.returnCurrent(employeeId).then(() => get().hydrate()).catch((error) => reportError(set, error));
  },

  cancelWork: async (workId) => {
    try {
      const employee = get().teams.flatMap((team) => team.employees).find((employee) => employee.currentWorkItem?.id === workId);
      if (employee && runScheduler) await runScheduler.cancelCurrentWork(employee.id);
      await weworkApi.cancelWork(workId);
      await get().hydrate();
    } catch (error) {
      reportError(set, error);
    }
  },

  updateWorkItem: async (workId, input) => {
    try { await weworkApi.updateWork(workId, input); await get().hydrate(); }
    catch (error) { reportError(set, error); }
  },

  createTeam: async (name, description, workspaceAssignment) => {
    await weworkApi.createTeam({ name, description, initializeLead: false, workspaceAssignment }).then(async (team) => {
      window.localStorage.setItem('wework.lastTeamId', team.id);
      window.localStorage.setItem('wework.lastTopology', 'roundTable');
      set({
        selectedTeamId: team.id,
        selectedEmployeeId: team.employees[0]?.id ?? null,
        topology: 'roundTable',
        viewMode: 'topDown',
        isCreateTeamOpen: false,
      });
      await get().hydrate();
    }).catch((error) => { reportError(set, error); throw error; });
  },

  archiveTeam: async (teamId) => {
    try { await weworkApi.archiveTeam(teamId); await get().hydrate(); }
    catch (error) { reportError(set, error); throw error; }
  },

  restoreTeam: async (teamId) => {
    try { await weworkApi.restoreTeam(teamId); await get().hydrate(); get().selectTeam(teamId); }
    catch (error) { reportError(set, error); throw error; }
  },

  deleteTeam: async (teamId) => {
    try { await weworkApi.deleteTeam(teamId); await get().hydrate(); }
    catch (error) { reportError(set, error); throw error; }
  },

  updateTeamWorkspace: async (teamId, workspaceAssignment) => {
    try { await weworkApi.updateTeamWorkspace(teamId, workspaceAssignment); await get().hydrate(); set({ serviceStatus: 'ready', serviceError: null }); }
    catch (error) { reportError(set, error); throw error; }
  },

  addEmployee: async (teamId, displayName, roleName, runtime, sessionExecution) => {
    await weworkApi.addEmployee(teamId, { displayName, roleName, runtime, sessionExecution }).then(async (employee) => {
      set({
        selectedTeamId: teamId,
        selectedEmployeeId: employee.id,
        isAddEmployeeOpen: false,
      });
      await get().hydrate();
    }).catch((error) => { reportError(set, error); throw error; });
  },

  removeEmployee: (teamId, employeeId) => {
    void weworkApi.removeEmployee(teamId, employeeId).then(async () => {
      if (get().selectedEmployeeId === employeeId) set({ selectedEmployeeId: null, isWorkbenchOpen: false });
      await get().hydrate();
    }).catch((error) => reportError(set, error));
  },

  updateEmployee: async (employeeId, input) => {
    try {
      await weworkApi.updateEmployee(employeeId, input);
      await get().hydrate();
      set({ serviceStatus: 'ready', serviceError: null });
    } catch (error) {
      reportError(set, error);
      throw error;
    }
  },

  createRuntimeProfile: async (input) => {
    try {
      const profile = await weworkApi.createRuntimeProfile(input);
      set((state) => ({ runtimeProfiles: [...state.runtimeProfiles, profile], serviceStatus: 'ready', serviceError: null }));
      return profile;
    } catch (error) {
      reportError(set, error);
      return undefined;
    }
  },

  resetEmployeeContext: async (employeeId) => {
    try {
      await weworkApi.resetEmployeeContext(employeeId);
      await get().hydrate();
    } catch (error) {
      reportError(set, error);
    }
  },

  setTeamLead: (teamId, employeeId) => {
    void weworkApi.setLead(teamId, employeeId).then(() => get().hydrate()).catch((error) => reportError(set, error));
  },

  saveWorkflow: async (teamId, workflow) => {
    set((state) => ({ teams: state.teams.map((team) => team.id === teamId ? { ...team, workflow } : team) }));
    try {
      const saved = await weworkApi.saveWorkflow(teamId, workflow);
      set((state) => ({
        teams: state.teams.map((team) => team.id === teamId ? { ...team, workflow: saved } : team),
        serviceStatus: 'ready',
        serviceError: null,
      }));
    } catch (error) {
      reportError(set, error);
      if (error instanceof Error && error.message.includes('WeWork API 409')) {
        try {
          const current = await weworkApi.getWorkflow(teamId);
          set((state) => ({ teams: state.teams.map((team) => team.id === teamId ? { ...team, workflow: current } : team) }));
        } catch (refreshError) { reportError(set, refreshError); }
      }
    }
  },

  addWorkflowNode: (teamId, position) => {
    const nodeId = `node-${Date.now()}`;
    set((state) => ({ teams: state.teams.map((team) => {
      if (team.id !== teamId) return team;
      const workflow = team.workflow ?? {
        id: `workflow-${Date.now()}`,
        name: `${team.name}工作流`,
        description: '按团队任务配置角色与依赖关系。',
        nodes: [],
      };
      const node: RoleNode = {
        id: nodeId,
        roleName: '待配置岗位',
        label: `阶段 ${workflow.nodes.length + 1}`,
        stepNumber: workflow.nodes.length + 1,
        status: 'ready',
        requires: [],
        position,
      };
      return { ...team, workflow: { ...workflow, nodes: [...workflow.nodes, node] } };
    }) }));
    return nodeId;
  },

  updateWorkflowNode: (teamId, nodeId, patch) => set((state) => ({
    teams: state.teams.map((team) => {
      if (team.id !== teamId || !team.workflow) return team;
      const candidateNodes = team.workflow.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node);
      if (hasWorkflowCycle(candidateNodes)) return team;
      return { ...team, workflow: { ...team.workflow, nodes: candidateNodes } };
    }),
  })),

  removeWorkflowNode: (teamId, nodeId) => set((state) => ({
    teams: state.teams.map((team) => {
      if (team.id !== teamId || !team.workflow) return team;
      const nodes = team.workflow.nodes
        .filter((node) => node.id !== nodeId)
        .map((node, index) => ({
          ...node,
          stepNumber: index + 1,
          requires: (node.requires ?? []).filter((requiredId) => requiredId !== nodeId),
        }));
      return { ...team, workflow: { ...team.workflow, nodes } };
    }),
  })),

  sendWorkbenchMessage: (employeeId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const { teams, selectedTeamId } = get();

    const updatedTeams = teams.map((team) => {
      if (team.id !== selectedTeamId) return team;
      return {
        ...team,
        employees: team.employees.map((employee) => {
          if (employee.id !== employeeId) return employee;
          const nowTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
          const userMsg = {
            id: `msg-u-${Date.now()}`,
            sender: 'user' as const,
            text: trimmed,
            time: nowTime,
          };
          return {
            ...employee,
            activeSession: {
              ...employee.activeSession,
              messages: [...employee.activeSession.messages, userMsg],
              contextRatio: Math.min(100, employee.activeSession.contextRatio + 5),
            },
          };
        }),
      };
    });

    set({ teams: updatedTeams });
    void weworkApi.sendMessage(employeeId, trimmed).then(async () => {
      await get().hydrate();
      if (!runScheduler) throw new Error('请使用 WeWork Desktop App 启动本地 Runtime 后再与助手对话。');
      await runScheduler.startPrompt(employeeId, trimmed);
    }).catch((error) => reportError(set, error));
  },

  sendTeamMessage: async (teamId, text, recipientId, contextTagIds) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await publishGroupMessage(weworkApi,hostManagedWeWork,teamId,trimmed,recipientId,contextTagIds);
      await get().hydrate();
    } catch(error) { reportError(set,error); throw error; }
  },
  cancelGroupDelivery: async(teamId,deliveryId)=>{
    if(weworkMode==='remote')throw new Error('Remote WeWork does not support group execution cancellation');
    await localWeWorkApi.cancelGroupDelivery(teamId,deliveryId);
    await get().hydrate();
  },
}));
