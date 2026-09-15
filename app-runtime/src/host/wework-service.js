import { employeeSessions } from '../../../src/domain/workbenchSessions.ts';
import { taskInputSignature } from '../wework-tools.js';
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createLocalWeWorkApi } from '../../../src/local/localWeWorkApi.ts';
import { normalizeRuntimeProfile, normalizeRuntimeProfileDraft, normalizeSessionExecution, normalizeWorkspaceAssignment } from '../../../src/domain/wework.ts';

const runtimeAdapters = new Map([
  ['pi', 'pi'], ['smalldash', 'smalldash'], ['smalldashharness', 'smalldash'], ['sdh', 'smalldash'],
  ['claude-code', 'claude-code'], ['codex-cli', 'codex-cli'], ['gemini-cli', 'gemini-cli'],
]);
const safeRunId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function effectiveRuntimeProfile(profile, weworkConfig = {}) {
  const result = structuredClone(profile);
  if (weworkConfig.harness?.id !== undefined) {
    const adapter = runtimeAdapters.get(weworkConfig.harness.id);
    if (!adapter) throw new Error('unsupported harness.id in WeWork config');
    if (adapter !== result.adapter) throw new Error('WeWork config cannot change the Harness of an existing Session');
  }
  if (weworkConfig.model) {
    const allowed = ['provider', 'modelId', 'api', 'baseUrl', 'contextWindow', 'maxTokens', 'credentialRef', 'apiKeyEnv'];
    result.model = { ...result.model, ...Object.fromEntries(allowed.filter((key) => weworkConfig.model[key] !== undefined).map((key) => [key, weworkConfig.model[key]])) };
  }
  if (result.profileRevision !== undefined) return normalizeSessionExecution(result);
  if (result.createdAt !== undefined || result.updatedAt !== undefined) return normalizeRuntimeProfile(result);
  const { id, ...draft } = result;
  if (!safeRunId.test(id ?? '')) throw new Error('invalid effective runtime profile id');
  return { ...normalizeRuntimeProfileDraft(draft), id };
}

function runtimeSettings(weworkConfig = {}) {
  return {
    ...(weworkConfig.context ? { context: structuredClone(weworkConfig.context) } : {}),
    ...(weworkConfig.permissions ? { permissions: structuredClone(weworkConfig.permissions) } : {}),
  };
}

// Single Host writer. Failed writes never replace the prior snapshot.
export class FileWeWorkStorage {
  constructor(path) { this.path = path; }
  getItem() {
    try { return readFileSync(this.path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  setItem(_key, value) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, value, { mode: 0o600 });
    const fd = openSync(temporary, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
  }
}

const uiMethods = new Set([
  'ensureConversation', 'snapshot', 'listRuntimeProfiles', 'createRuntimeProfile', 'bootstrap', 'importLocalState',
  'createTeam', 'archiveTeam', 'restoreTeam', 'deleteTeam', 'updateTeamWorkspace', 'addEmployee', 'removeEmployee', 'updateEmployee', 'resetEmployeeContext', 'setLead',
  'createWork', 'assignWork', 'updateWork', 'cancelWork', 'completeCurrent', 'returnCurrent',
  'acknowledgeEmployeeError', 'getWorkflow', 'saveWorkflow', 'createWorkflow', 'selectWorkflow', 'listWorkflowReferences', 'configureWorkType', 'startWorkflow', 'sendMessage', 'sendAssistantMessage', 'sendTeamMessage',
  'getWorkContext', 'readTaskField', 'readWorkDocument', 'saveWorkDocument', 'reportProgress', 'submitDeliverable',
  'reviewDeliverable', 'getWorkRecords', 'postGroupMessage', 'retryGroupDelivery', 'cancelGroupDelivery', 'noteGroupDelivery', 'requestHandoff', 'decideHandoff', 'getGroupContext', 'readGroupMessage',
  'replaceCollaborationDatabase', 'configureTeamModules', 'createCollaborationWorkItem', 'updateCollaborationWorkItem', 'deleteCollaborationWorkItem', 'deleteCollaborationDatabase',
]);

export class WeWorkService {
  constructor(storage, options = {}) {
    this.api = createLocalWeWorkApi(storage);
    this.nativePiCommand = options.nativePiCommand;
    this.workspaceLayout = options.workspaceLayout;
    this.configRoot = options.configRoot;
    this.configurationResolver = options.configurationResolver;
    this.currentWorkspace = options.currentWorkspace;
    this.listCredentials = options.listCredentials;
    this.workspaceInitializationTimeoutMs = options.workspaceInitializationTimeoutMs ?? 5000;
  }
  attachCoordinator(coordinator) { this.coordinator = coordinator; }
  async reconcileWorkspaces() {
    if (!this.workspaceLayout) return;
    const teams = (await this.api.snapshot()).teams;
    await this.#initializeWorkspaces(teams);
  }
  projectWorkflowExecutions(snapshot) {
    return { ...snapshot, teams: snapshot.teams.map(team => ({ ...team, workflowExecutions: this.workflowSupervisor?.snapshot(team.id) ?? [] })) };
  }
  async call(method, args = []) {
    if (this.workflowSupervisor && ['startWorkflow', 'getWorkflowExecution', 'pauseWorkflowExecution', 'resumeWorkflowExecution'].includes(method)) {
      const count = method === 'startWorkflow' ? 1 : 2;
      if (!Array.isArray(args) || args.length !== count || !args.every(value => typeof value === 'string' && value.length)) throw new Error('Invalid workflow execution request');
      if (method === 'startWorkflow') return this.workflowSupervisor.start(args[0]);
      return this.workflowSupervisor.control(args[0], args[1], method === 'getWorkflowExecution' ? undefined : method === 'resumeWorkflowExecution');
    }

    if (method === 'snapshot' && this.coordinator?.runtime.get) {
      const snapshot = await this.api.snapshot(...args); let changed=false;
      for (const team of snapshot.teams) for (const employee of team.employees) {
        const activity=employee.executionActivity;
        if(activity?.state!=='working'||!activity.runId||this.coordinator.busy(employee.id))continue;
        let run; try {run=await this.coordinator.runtime.get(activity.runId);}catch(error){if(!['ENOENT','RUN_NOT_FOUND'].includes(error.code))throw error;}
        const failed=!run||!['succeeded','cancelled'].includes(run.status);
        await this.api.setEmployeeActivity(employee.id,failed?'error':employee.currentWorkItem?'waiting':'idle',failed?(run?.error??'执行已中断，请检查后重试'):employee.currentWorkItem?'等待交付审核':'当前没有执行中的任务');
        for (const session of employeeSessions(employee)) if (session.activity?.state === 'working' && session.activity.runId === activity.runId) {
          await this.api.setSessionActivity(employee.id,session.id,{state:failed?'error':run.status==='cancelled'?'idle':'waiting',detail:failed?(run?.error ?? '执行已中断'):run.status==='cancelled'?'执行已停止':'执行完成'});
        }
        changed=true;
      }
      return this.projectWorkflowExecutions(changed ? await this.api.snapshot(...args) : snapshot);
    }
    if (method === 'sendWorkbenchTab' || method === 'stopWorkbenchTab') {
      const sending = method === 'sendWorkbenchTab';
      if (!Array.isArray(args) || args.length !== (sending ? 3 : 2) || !args.every(value => typeof value === 'string') || !this.coordinator) throw new Error('无效的会话操作');
      const [employeeId, tabId, text] = args;
      if (sending && (!text.trim() || text.length > 100000)) throw new Error('消息不能为空或过长');
      const session = await this.api.ensureConversation(employeeId, tabId);
      const state = await this.api.snapshot();
      const team = state.teams.find(team => team.employees.some(employee => employee.id === employeeId));
      const employee = team.employees.find(employee => employee.id === employeeId);
      const activeEntry = () => [...this.coordinator.runtime.active.entries()].find(([, run]) => run.employeeId === employeeId);
      if (!sending) return this.coordinator.withEmployees([employeeId], async () => {
        const active = activeEntry();
        if (!active || active[1].displaySessionId !== session.id) return {stopped:false};
        await this.coordinator.stopEmployee(employeeId);
        await this.api.setSessionActivity(employeeId, session.id, {state:'idle', detail:'执行已停止'});
        await this.api.setEmployeeActivity(employeeId, 'idle', '执行已停止');
        this.coordinator.runtime.journal?.publish({type:'wework.updated'});
        return {stopped:true};
      });
      const active = activeEntry();
      if (active && active[1].displaySessionId !== session.id) throw new Error('助手正在另一个 Tab 执行；请等待，或切到对应 Tab 停止。');
      if (tabId === 'group') {
        if (active) return this.call('steerGroupDelivery', [team.id, active[1].deliveryId, text]);
        await this.api.postGroupMessage(team.id, {text, recipientId:employeeId, requestId:randomUUID()});
        void this.coordinator.drain().catch(() => {});
        return {queued:true};
      }
      if (tabId !== 'private' && (employee.currentWorkItem?.id !== tabId || employee.currentWorkItem.cancelledAt)) throw new Error('这项工作当前不可执行；排队工作需等待分配，已结束工作仅供查看。');
      if (active) {
        const result = await this.coordinator.runtime.steerEmployee(employeeId, text, {sessionId:session.id});
        if (result.accepted) { await this.api.sendMessage(employeeId, text, tabId); return {steered:true}; }
      }
      if (tabId !== 'private' && this.workflowSupervisor?.owns(team.id, employee.currentWorkItem.workflowId)) {
        return this.workflowSupervisor.continueWork(team.id, employee.currentWorkItem.workflowId, employeeId, tabId, text);
      }
      // Admission and session routing are checked again by startRun.
      await this.api.sendMessage(employeeId, text, tabId);
      await this.startRun({id:`run-${randomUUID()}`,employeeId,workId:tabId === 'private' ? `chat-${randomUUID()}` : tabId,...(tabId === 'private' ? {work:{goal:text}} : {prompt:text})}, this.coordinator.runtime);
      return {steered:false};
    }
    if (method === 'steerGroupDelivery') {
      if (!Array.isArray(args) || args.length !== 3 || !args.every(value => typeof value === 'string') || !this.coordinator) throw new Error('无效的群聊补充请求');
      const [teamId, deliveryId, message] = args;
      const team = (await this.api.snapshot()).teams.find(team => team.id === teamId);
      const delivery = team?.collaborationDeliveries?.find(delivery => delivery.id === deliveryId);
      if (!delivery || delivery.status !== 'running') throw new Error('这次回复已不在执行中，请发送新消息');
      const result = await this.coordinator.runtime.steerEmployee(delivery.employeeId, message, {deliveryId});
      if (!result.accepted) throw new Error('这次回复已结束，请发送新消息');
      await this.api.recordGroupSteering(teamId, deliveryId, message);
      this.coordinator.runtime.journal?.publish({type:'wework.updated',runId:result.runId});
      return result;
    }
    if (method === 'stopEmployee') {
      if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== 'string' || !this.coordinator) throw new Error('停止执行需要有效助手和桌面执行器');
      return this.coordinator.withEmployees([args[0]], async () => {
        await this.coordinator.stopEmployee(args[0]);
        await this.api.setEmployeeActivity(args[0], 'idle', '执行已停止');
        this.coordinator.runtime.journal?.publish({type:'wework.updated'});
        return {stopped:true};
      });
    }
    if (method === 'nativeHarnessCommand') {
      if (!Array.isArray(args) || args.length !== 2 || !['pi:compact','pi:status'].includes(args[1])) throw new Error('不支持的原生命令');
      if (!this.nativePiCommand || !this.coordinator) throw new Error('原生命令需要桌面执行器');
      return this.coordinator.withAdmission(args[0], async () => {
        const spec = await this.prepare({id:`command-${randomUUID()}`,employeeId:args[0],workId:'chat-command',work:{goal:''}});
        if (spec.runtimeProfile.adapter !== 'pi') throw new Error('当前助手未使用 Pi，不能执行 /pi: 命令');
        let result;
        try { result = await this.nativePiCommand(spec, args[1].slice(3)); }
        catch (error) {
          if (args[1] === 'pi:compact' && /nothing to compact/i.test(error.message ?? '')) return {skipped:true};
          throw error;
        }
        if (args[1] === 'pi:compact') {
          // Pi reports an estimate immediately after compaction; do not present old usage as current.
          await this.api.clearSessionContextMeasurement(args[0]);
          this.coordinator.runtime.journal?.publish({type:'wework.updated'});
        }
        return result;
      });
    }
    if (!uiMethods.has(method) || !Array.isArray(args) || args.length > (method === 'sendTeamMessage' ? 4 : 3)) throw new Error('unsupported WeWork API method');
    if (method === 'updateTeamWorkspace') await this.#validateCredentialAssignment(args[1]);
    if (method === 'updateEmployee') await this.#validateCredentialAssignment(args[1]?.workspaceAssignment);
    if (method === 'bootstrap' || method === 'importLocalState') {
      const existing = await this.api.snapshot();
      const willImport = method === 'bootstrap' ? existing.teams.length === 0 : existing.teams.length === 0 && existing.runtimeProfiles.length === 0;
      if (willImport) await this.#validateTeamCredentials(method === 'bootstrap' ? args[0] : args[0]?.teams);
    }
    if (method === 'cancelGroupDelivery') {
      return this.coordinator ? this.coordinator.cancelGroupDelivery(...args) : this.api.cancelGroupDelivery(...args);
    }
    if (method === 'decideHandoff') {
      if (!this.coordinator) throw new Error('Host collaboration coordinator is unavailable');
      return this.coordinator.decideHandoff(...args);
    }
    if (['archiveTeam', 'deleteTeam'].includes(method)) {
      const state = await this.api.snapshot({ includeArchived: true });
      const team = state.teams.find((candidate) => candidate.id === args[0]);
      if (!team) throw new Error('team not found');
      const activeEmployeeIds = new Set([...(this.coordinator?.runtime?.active?.values() ?? [])].map((run) => run.employeeId));
      if (team.employees.some((employee) => activeEmployeeIds.has(employee.id))) throw new Error('wait for active team runs to stop before archiving or deleting');
    }
    if (['cancelWork', 'returnCurrent', 'resetEmployeeContext', 'removeEmployee', 'updateEmployee', 'completeCurrent'].includes(method) && this.coordinator) {
      const state = await this.api.snapshot();
      const employee = method === 'cancelWork' ? state.teams.flatMap((t) => t.employees).find((b) => b.currentWorkItem?.id === args[0] || b.queuedWorkItems?.some((w) => w.id === args[0])) : state.teams.flatMap((t) => t.employees).find((b) => b.id === (method === 'removeEmployee' ? args[1] : args[0]));
      if (employee) return this.coordinator.withEmployees([employee.id], async () => {
        if (method === 'completeCurrent') {
          if ([...(this.coordinator.runtime.active?.values() ?? [])].some((run) => run.employeeId === employee.id)) throw new Error('wait for active execution before completing work');
        } else if (method !== 'cancelWork' || employee.currentWorkItem?.id === args[0]) await this.coordinator.stopEmployee(employee.id);
        return this.api[method](...args);
      });
    }
    if (['completeCurrent', 'returnCurrent', 'resetEmployeeContext'].includes(method) && this.isEmployeeActive?.(args[0])) throw new Error('wait for the active employee run to stop first');
    if (method === 'reviewDeliverable') {
      const snapshot = await this.api.snapshot();
      const employee = snapshot.teams.flatMap((team) => team.employees).find((employee) => employee.currentWorkItem?.id === args[0]);
      if (employee && this.isEmployeeActive?.(employee.id)) throw new Error('wait for the active employee run before review');
    }
    // Identity-bearing methods receive their actor only via the run-bound tool dispatcher.
    if (method === 'sendTeamMessage') args = [args[0],args[1],undefined,args[3]];
    if (['saveWorkDocument', 'reportProgress', 'submitDeliverable', 'requestHandoff'].includes(method)) args = args.slice(0, 2);
    const result = await this.api[method](...args);
    if (this.workspaceLayout && method === 'createTeam') await this.#initializeWorkspaces([result]);
    if (this.workspaceLayout && method === 'addEmployee') {
      const state = await this.api.snapshot();
      const team = state.teams.find((candidate) => candidate.id === args[0]);
      if (!team) throw new Error('team not found after employee creation');
      const initialization = this.workspaceLayout.ensureEmployee(team, result);
      await Promise.race([
        initialization,
        new Promise((resolve) => setTimeout(resolve, this.workspaceInitializationTimeoutMs)),
      ]);
      // Workspace initialization is idempotent. If slow filesystem I/O outlives the
      // UI request, let it finish in the background; run preparation verifies it again.
      void initialization.catch((error) => console.error('Employee workspace initialization failed:', error));
    }
    if (this.workspaceLayout && ['bootstrap', 'importLocalState'].includes(method) && result?.imported) await this.reconcileWorkspaces();
    if (method === 'snapshot') return this.projectWorkflowExecutions(result);
    if (['postGroupMessage', 'retryGroupDelivery'].includes(method)) void this.coordinator?.drain().catch(() => {});
    return result;
  }
  async startRun(spec, runtime, { workflowExecution = false } = {}) {
    const state = await this.api.snapshot();
    const deliveryId = spec.wework?.deliveryId ?? spec.deliveryId;
    const employeeId = deliveryId ? state.teams.flatMap((t) => t.collaborationDeliveries ?? []).find((d) => d.id === deliveryId)?.employeeId : spec.employeeId;
    if (!employeeId) throw new Error('run recipient not found');
    const start = async () => {
      const prepared = await this.prepare(spec);
      const team = (await this.api.snapshot()).teams.find(t => t.employees.some(e => e.id === employeeId));
      const work = team?.employees.find(e => e.id === employeeId)?.currentWorkItem;
      if (!workflowExecution && work?.id === prepared.workId && this.workflowSupervisor?.owns(team.id, work.workflowId)) throw new Error('这项工作由团队统一推进，请在任务会话中发送补充指令，或点击“继续工作”。');
      await this.api.setEmployeeActivity(employeeId,'working',prepared.wework.group ? '正在处理群聊消息' : prepared.wework.chat ? '正在处理对话消息' : prepared.work.title,prepared.id);
      await this.api.setSessionActivity(employeeId, prepared.wework.displaySessionId, {state:'working', detail:prepared.work.title, runId:prepared.id});
      runtime.journal?.publish({type:'wework.updated'});
      try { return await runtime.start(prepared); }
      catch(error) { await this.api.setSessionActivity(employeeId,prepared.wework.displaySessionId,{state:'error',detail:error.message ?? '启动执行失败'}); await this.api.setEmployeeActivity(employeeId,'error',error.message ?? '启动执行失败');runtime.journal?.publish({type:'wework.updated'});throw error; }
    };
    return this.coordinator ? this.coordinator.withAdmission(employeeId, start) : start();
  }
  async startExternalRun(spec, runtime) {
    const prepared = await this.prepareExternal(spec);
    return runtime.start(prepared);
  }
  async prepareExternal(spec) {
    if (!spec?.team || !spec?.employee || !safeRunId.test(spec.id ?? '') || !safeRunId.test(spec.employee.id ?? '') || !safeRunId.test(spec.workId ?? '') || !safeRunId.test(spec.session?.id ?? '')) throw new Error('invalid external run identity');
    if (spec.employeeId !== spec.employee.id || spec.work?.id !== spec.workId || typeof spec.work?.title !== 'string' || typeof spec.work?.goal !== 'string') throw new Error('invalid external run metadata');
    let profile;
    if (spec.runtimeProfile?.profileRevision !== undefined) profile = normalizeSessionExecution(spec.runtimeProfile);
    else {
      try { profile = normalizeRuntimeProfile(spec.runtimeProfile); }
      catch {
        if (!safeRunId.test(spec.runtimeProfile?.id ?? '')) throw new Error('invalid external runtime profile id');
        const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = spec.runtimeProfile;
        profile = { ...normalizeRuntimeProfileDraft(draft), id };
      }
    }
    const workspaceContext = await this.#workspaceContext(spec.team, spec.employee, spec);
    const settings = runtimeSettings(workspaceContext.weworkConfig);
    const maxMessages = settings.context?.maxMessages;
    const messages = Array.isArray(spec.session.messages) ? spec.session.messages : [];
    const nativeSessionId = spec.session.nativeSessionId;
    if (nativeSessionId !== undefined && !safeRunId.test(nativeSessionId)) throw new Error('invalid external native Session identity');
    return {
      id: spec.id, employeeId: spec.employee.id, workId: spec.workId,
      runtimeProfile: effectiveRuntimeProfile(profile, workspaceContext.weworkConfig),
      ...workspaceContext, runtimeSettings: settings,
      employee: { id: spec.employee.id, displayName: spec.employee.displayName, roleName: spec.employee.roleName, skills: spec.employee.skills ?? [] },
      work: { id: spec.workId, title: spec.work.title, goal: spec.work.goal, constraints: spec.work.constraints },
      session: { id: spec.session.id, ...(nativeSessionId ? { nativeSessionId } : {}), messages: Number.isInteger(maxMessages) ? messages.slice(-maxMessages) : messages },
    };
  }
  async prepare(spec) {
    const state = await this.api.snapshot();
    const deliveryId = spec.wework?.deliveryId ?? spec.deliveryId;
    if (deliveryId) return this.prepareGroup(spec, state, deliveryId);
    const team = state.teams.find((t) => t.employees.some((b) => b.id === spec.employeeId));
    const employee = team?.employees.find((b) => b.id === spec.employeeId);
    if (!employee) throw new Error('employee not found in Host WeWork store');
    if (this.coordinator?.transitioning.has(employee.id)) throw new Error('employee ownership transition in progress');
    const chat = typeof spec.workId === 'string' && spec.workId.startsWith('chat-');
    const work = chat ? { id: spec.workId, title: 'Workbench conversation', goal: spec.work?.goal } : employee.currentWorkItem;
    if (!work || work.id !== spec.workId || typeof work.goal !== 'string') throw new Error('work is not assigned to this employee');
    const displaySession = await this.api.ensureConversation(employee.id, chat ? 'private' : work.id);
    const legacyProfileId = work.runtimeProfileId ?? employee.defaultRuntimeProfileId ?? team.defaultRuntimeProfileId;
    const profile = employee.activeSession.execution?.enabled !== false
      ? employee.activeSession.execution
      : state.runtimeProfiles.find((p) => p.id === legacyProfileId && p.enabled);
    if (!profile) throw new Error('enabled runtime profile is required');
    const context = chat ? null : await this.api.getWorkContext(work.id);
    const workspaceContext = await this.#workspaceContext(team, employee, spec);
    return {
      id: spec.id, employeeId: employee.id, workId: work.id,
      runtimeProfile: effectiveRuntimeProfile(profile, workspaceContext.weworkConfig), ...workspaceContext, runtimeSettings: runtimeSettings(workspaceContext.weworkConfig),
      employee: { id: employee.id, displayName: employee.displayName, roleName: employee.roleName, skills: employee.builtInSkills ?? [] },
      followUp: typeof spec.prompt === 'string' ? spec.prompt.slice(0, 10000) : undefined,
      work: { id: work.id, title: work.title, goal: work.goal, constraints: work.constraints },
      // A task has its own execution history; chat reset also invalidates its checkpoint.
      session: { id: `${displaySession.id}${chat ? '-chat' : ''}-${profile.id}`, messages: [] },
wework: { displaySessionId: displaySession.id, teamId: team.id, weworkSessionId: team.weworkSessionId ?? team.id, chat, context, inputSignature: chat ? null : taskInputSignature(work), modules: structuredClone(team.modules), isLead: employee.isLead === true, isWorkflowLead: team.workflow?.leadEmployeeId === employee.id, permissionMode: employee.activeSession.permissionMode ?? 'auto' },
    };
  }
  async prepareGroup(spec, state, deliveryId) {
    const team = state.teams.find((t) => t.collaborationDeliveries?.some((d) => d.id === deliveryId));
    const delivery = team?.collaborationDeliveries?.find((d) => d.id === deliveryId);
    if (!delivery || delivery.status !== 'running' || delivery.runId !== spec.id) throw new Error('group delivery is not reserved for this run');
    const employee = team.employees.find((b) => b.id === delivery.employeeId);
    if (!employee || this.coordinator?.transitioning.has(employee.id)) throw new Error('group recipient unavailable');
    const displaySession = await this.api.ensureConversation(employee.id, 'group');
    const legacyProfileId = employee.defaultRuntimeProfileId ?? team.defaultRuntimeProfileId;
    const profile = employee.activeSession.execution?.enabled !== false
      ? employee.activeSession.execution
      : state.runtimeProfiles.find((p) => p.id === legacyProfileId && p.enabled);
    if (!profile) throw new Error('enabled runtime profile is required');
    const context = await this.api.getGroupContext(team.id, delivery.id);
    const workspaceContext = await this.#workspaceContext(team, employee, spec);
    return {
      id: spec.id, employeeId: employee.id, workId: `group-${delivery.id}`, runtimeProfile: effectiveRuntimeProfile(profile, workspaceContext.weworkConfig),
      ...workspaceContext,
      runtimeSettings: runtimeSettings(workspaceContext.weworkConfig),
      employee: { id: employee.id, displayName: employee.displayName, roleName: employee.roleName, skills: employee.builtInSkills ?? [] },
      work: { id: `group-${delivery.id}`, title: 'WeWork group conversation', goal: context.trigger.text },
      session: { id: `${displaySession.id}-${profile.id}`, messages: [] },
      wework: { displaySessionId: displaySession.id, teamId: team.id, weworkSessionId: team.weworkSessionId ?? team.id, group: true, deliveryId, chat: true, context, modules: structuredClone(team.modules), isLead: employee.isLead === true, permissionMode: employee.activeSession.permissionMode ?? 'auto' },
    };
  }
  async #initializeWorkspaces(teams) {
    for (const team of teams) {
      await this.workspaceLayout.ensureTeam(team);
      for (const employee of team.employees) await this.workspaceLayout.ensureEmployee(team, employee);
    }
  }
  async #workspaceContext(team, employee, spec) {
    const selectedWorkspace = await this.#resolveWorkspace(team, employee);
    if (!this.workspaceLayout) return { workspace: selectedWorkspace };
    const teamPaths = await this.workspaceLayout.ensureTeam(team);
    const employeePaths = await this.workspaceLayout.ensureEmployee(team, employee);
    const resolved = this.configurationResolver ? await this.configurationResolver({ configRoot: this.configRoot, teamRoot: teamPaths.root, employeeRoot: employeePaths.root, sessionConfig: spec.sessionConfig, taskConfig: spec.taskConfig }) : { config: {}, prompts: [] };
    return { workspace: selectedWorkspace ?? { kind: 'local', rootPath: employeePaths.root }, skillRoots: [employeePaths.skills, teamPaths.skills], weworkConfig: resolved.config, weworkPrompts: resolved.prompts };
  }
  async #resolveWorkspace(team, employee, override, hasOverride = false) {
    const assignment = normalizeWorkspaceAssignment(hasOverride ? override : employee?.workspaceAssignment ?? team?.workspaceAssignment);
    await this.#validateCredentialAssignment(assignment);
    // Migrate only the obsolete generated directory, never an arbitrary user path.
    if (employee && this.workspaceLayout && assignment?.kind === 'local' &&
        team.name && !/[\\/]/.test(team.name) && team.name !== '.' && team.name !== '..' &&
        assignment.rootPath === join(this.workspaceLayout.weworkRoot, team.name, 'employees', employee.id)) {
      try { await stat(assignment.rootPath); }
      catch(error) {
        if (error.code !== 'ENOENT') throw error;
        const paths = await this.workspaceLayout.ensureEmployee(team, employee);
        return {kind:'local',rootPath:paths.root};
      }
    }

    if (assignment?.kind === 'local' && !assignment.rootPath && !this.workspaceLayout && this.currentWorkspace) return this.#resolveCurrentWorkspace();
    if (assignment && !(assignment.kind === 'local' && !assignment.rootPath)) return assignment;
    if (!this.workspaceLayout) return undefined;
    const paths = employee ? await this.workspaceLayout.ensureEmployee(team, employee) : await this.workspaceLayout.ensureTeam(team);
    return { kind: 'local', rootPath: paths.root };
  }
  async resolveSkillWorkspace(input = {}) {
    return (await this.resolveSkillCatalog(input)).workspace;
  }
  async resolveSkillCatalog(input = {}) {
    if (input.kind) {
      const assignment = normalizeWorkspaceAssignment(input);
      const workspace = assignment?.kind === 'local' && !assignment.rootPath ? await this.#resolveCurrentWorkspace() : assignment;
      return { workspace, skillRoots: [] };
    }
    if (!input.team && !input.teamId && !input.employeeId) return { workspace: await this.#resolveCurrentWorkspace(), skillRoots: [] };
    let team = input.team;
    let employee = input.employee;
    if (team) {
      if (!safeRunId.test(team.id ?? '') || typeof team.name !== 'string' || !team.name.trim()) throw new Error('invalid team metadata for Skill discovery');
      if (employee && !safeRunId.test(employee.id ?? '')) throw new Error('invalid employee metadata for Skill discovery');
      if (employee?.displayName !== undefined && (typeof employee.displayName !== 'string' || !employee.displayName.trim())) throw new Error('invalid employee metadata for Skill discovery');
      if (input.teamId && input.teamId !== team.id || input.employeeId && input.employeeId !== employee?.id) throw new Error('conflicting Skill discovery identity');
    } else {
      const state = await this.api.snapshot();
      team = state.teams.find((candidate) => candidate.id === input.teamId || candidate.employees.some((candidate) => candidate.id === input.employeeId));
      if (!team) throw new Error('team not found for Skill discovery');
      employee = input.employeeId ? team.employees.find((candidate) => candidate.id === input.employeeId) : undefined;
      if (input.employeeId && !employee) throw new Error('employee not found for Skill discovery');
    }
    const inheritedEmployee = input.inheritTeam === true ? undefined : employee;
    const workspace = await this.#resolveWorkspace(team, inheritedEmployee, input.workspaceAssignment, Object.hasOwn(input, 'workspaceAssignment'));
    if (!this.workspaceLayout) return { workspace, skillRoots: [] };
    const teamPaths = await this.workspaceLayout.ensureTeam(team);
    const employeePaths = employee
      ? employee.displayName
        ? await this.workspaceLayout.ensureEmployee(team, employee)
        : this.workspaceLayout.paths(team.id, employee.id)
      : undefined;
    return { workspace, skillRoots: [employeePaths?.skills, teamPaths.skills].filter(Boolean) };
  }
  async #resolveCurrentWorkspace() {
    if (!this.currentWorkspace) throw new Error('current Workspace resolver is unavailable');
    const workspace = await this.currentWorkspace();
    if (!workspace || workspace.kind !== 'local' || typeof workspace.rootPath !== 'string') throw new Error('invalid current Workspace');
    return workspace;
  }
  async #validateTeamCredentials(teams) {
    if (!Array.isArray(teams)) return;
    for (const team of teams) {
      await this.#validateCredentialAssignment(team?.workspaceAssignment);
      for (const employee of team?.employees ?? []) await this.#validateCredentialAssignment(employee?.workspaceAssignment);
    }
  }
  async #validateCredentialAssignment(value) {
    const assignment = normalizeWorkspaceAssignment(value);
    if (assignment?.kind !== 'ssh') return assignment;
    if (!this.listCredentials) throw new Error('credential reference resolver is unavailable');
    const metadata = (await this.listCredentials()).find((item) => item.ref === assignment.credentialRef);
    if (!metadata || !['ssh-password', 'ssh-private-key'].includes(metadata.kind)) throw new Error('SSH credential reference is missing or has the wrong kind');
    return assignment;
  }
  async recordEvents(spec, events) {
    if (!spec.wework?.displaySessionId) return;
    await this.api.appendRuntimeEvents(spec.employeeId, spec.wework.displaySessionId, spec.id, events);
    this.coordinator?.runtime.journal?.publish({type:'wework.updated', runId:spec.id});
  }
  async finish(spec, result, error) {
    const state = error ? (error.name === 'AbortError' ? 'idle' : 'error') : spec.wework.chat ? 'idle' : 'waiting';
    await this.api.setEmployeeActivity(spec.employeeId,state,error ? error.message ?? '执行失败' : spec.wework.chat ? '当前没有执行中的任务' : '执行完成，等待交付审核');
    if (spec.wework.displaySessionId) await this.api.setSessionActivity(spec.employeeId,spec.wework.displaySessionId,{state,detail:error ? error.message ?? '执行失败' : '执行完成'});
    this.coordinator?.runtime.journal?.publish({type:'wework.updated'});
    if (spec.wework.group) return; // Coordinator publishes only after runtime terminal state is durable.
    if (result?.finalText) {
      const employee = (await this.api.snapshot()).teams.flatMap(team => team.employees).find(employee => employee.id === spec.employeeId);
      const displaySession = employee && (spec.wework.displaySessionId ? employeeSessions(employee).find(session => session.id === spec.wework.displaySessionId) : employee.activeSession);
      const streamed = displaySession?.messages.filter(message => message.runtimeRunId === spec.id && message.runtimeKind === 'text').map(message => message.text).join('') ?? '';
      if (!streamed.endsWith(result.finalText)) await this.api.sendAssistantMessage(spec.employeeId, result.finalText, spec.wework.displaySessionId);
    }
    if (spec.runtimeProfile.adapter === 'pi' && result?.usage?.context) await this.api.updateSessionContextUsage(spec.employeeId, result.usage, spec.wework.displaySessionId);
    if (!spec.wework.chat) {
      await this.api.reportProgress(spec.workId, {
        summary: error ? 'Execution interrupted or failed; task remains unaccepted.' : 'Execution finished; delivery still requires submission and review.',
        nextStep: error ? 'Inspect the run before retrying.' : 'Submit or review the deliverable.',
      }, { employeeId: spec.employeeId, runId: spec.id });
    }
  }
}
