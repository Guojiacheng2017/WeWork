import { WeWorkHostError } from './weworkHost';
import type { ResolvedWorkspace } from '../domain/wework';

type SchedulerPorts = {
  managedWeWork?: boolean;
  wework: { snapshot(): Promise<any>; listRuntimeProfiles(): Promise<{ profiles: any[] }> };
  host: { currentWorkspace(): Promise<ResolvedWorkspace>; dataInfo?(): Promise<{ rootPath: string }>; startRun(spec: object): Promise<{ id: string; status: string }>; cancelRun?(runId: string): Promise<unknown>; run?(runId: string): Promise<{ status: string }> };
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
};

export class LocalRunScheduler {
  private activeByEmployee = new Map<string, string>();
  private promptRunIds = new Set<string>();
  private readonly storageKey = 'wework:active-runs';
  constructor(private ports: SchedulerPorts) {
    try { this.activeByEmployee = new Map(JSON.parse(ports.storage?.getItem(this.storageKey) ?? '[]')); } catch { this.activeByEmployee = new Map(); }
  }
  private persist() { this.ports.storage?.setItem(this.storageKey, JSON.stringify([...this.activeByEmployee])); }
  private async resolveWorkspace(team: any, employee: any): Promise<ResolvedWorkspace> {
    const assignment = employee.workspaceAssignment ?? team.workspaceAssignment;
    if (!assignment || assignment.kind === 'local' && !assignment.rootPath) {
      if (!this.ports.host.dataInfo) throw new WeWorkHostError('HOST_INTERNAL', 'canonical WeWork directory resolver is unavailable', 503);
      const info = await this.ports.host.dataInfo();
      if (typeof team.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(team.id)) throw new WeWorkHostError('HOST_INTERNAL', 'invalid team workspace id', 422);
      if (typeof employee.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(employee.id)) throw new WeWorkHostError('HOST_INTERNAL', 'invalid employee workspace id', 422);
      const separator = info.rootPath.includes('\\') && !info.rootPath.includes('/') ? '\\' : '/';
      return { kind: 'local', rootPath: `${info.rootPath.replace(/[\\/]$/, '')}${separator}${team.id}${separator}employees${separator}${employee.id}` };
    }
    return assignment;
  }
  async startCurrentWork(employeeId: string, prompt?: string) {
    if (this.activeByEmployee.has(employeeId)) throw new WeWorkHostError('RUN_ALREADY_ACTIVE', 'employee already has an active run', 409);
    const [{ teams }, { profiles }] = await Promise.all([this.ports.wework.snapshot(), this.ports.wework.listRuntimeProfiles()]);
    const team = teams.find((candidate: any) => candidate.employees.some((employee: any) => employee.id === employeeId));
    const employee = team?.employees.find((employee: any) => employee.id === employeeId);
    const work = employee?.currentWorkItem;
    if (!employee || !work) throw new WeWorkHostError('HOST_INTERNAL', 'employee has no running work', 409);
    const sessionExecution = employee.activeSession.execution;
    const profileId = work.runtimeProfileId ?? employee.defaultRuntimeProfileId ?? team.defaultRuntimeProfileId;
    const runtimeProfile = sessionExecution?.enabled !== false && sessionExecution ? sessionExecution : profiles.find((profile) => profile.id === profileId && profile.enabled);
    if (!runtimeProfile) throw new WeWorkHostError('RUNTIME_PROFILE_MISSING', 'enabled employee execution configuration is required', 409);
    const workspace = await this.resolveWorkspace(team, employee);
    const id = `run-${crypto.randomUUID()}`;
    const spec = {
      id, employeeId, weworkManaged: this.ports.managedWeWork, workId: work.id, runtimeProfile, workspace, prompt,
      team: { id: team.id, name: team.name, workspaceAssignment: team.workspaceAssignment },
      employee: { id: employee.id, displayName: employee.displayName, roleName: employee.roleName, skills: employee.builtInSkills ?? [], workspaceAssignment: employee.workspaceAssignment },
      work: { id: work.id, title: work.title, goal: work.goal, constraints: work.constraints },
      session: { id: employee.activeSession.id, messages: employee.activeSession.messages ?? [] },
    };
    const run = await this.ports.host.startRun(spec);
    this.activeByEmployee.set(employeeId, run.id);
    this.persist();
    return run;
  }
  async startPrompt(employeeId: string, prompt: string) {
    if (this.activeByEmployee.has(employeeId)) throw new WeWorkHostError('RUN_ALREADY_ACTIVE', 'employee already has an active run', 409);
    const [{ teams }, { profiles }] = await Promise.all([this.ports.wework.snapshot(), this.ports.wework.listRuntimeProfiles()]);
    const team = teams.find((candidate: any) => candidate.employees.some((employee: any) => employee.id === employeeId));
    const employee = team?.employees.find((employee: any) => employee.id === employeeId);
    if (!employee) throw new WeWorkHostError('HOST_INTERNAL', 'employee not found', 404);
    if (this.ports.managedWeWork && employee.currentWorkItem) return this.startCurrentWork(employeeId, prompt);
    const sessionExecution = employee.activeSession.execution;
    const profileId = employee.defaultRuntimeProfileId ?? team.defaultRuntimeProfileId;
    const runtimeProfile = sessionExecution?.enabled !== false && sessionExecution ? sessionExecution : profiles.find((profile) => profile.id === profileId && profile.enabled);
    if (!runtimeProfile) throw new WeWorkHostError('RUNTIME_PROFILE_MISSING', 'enabled employee execution configuration is required', 409);
    const workspace = await this.resolveWorkspace(team, employee);
    const id = `run-${crypto.randomUUID()}`;
    const chatWorkId = `chat-${crypto.randomUUID()}`;
    const run = await this.ports.host.startRun({
      id, employeeId, weworkManaged: this.ports.managedWeWork, workId: chatWorkId, runtimeProfile, workspace,
      team: { id: team.id, name: team.name, workspaceAssignment: team.workspaceAssignment },
      employee: { id: employee.id, displayName: employee.displayName, roleName: employee.roleName, skills: employee.builtInSkills ?? [], workspaceAssignment: employee.workspaceAssignment },
      work: { id: chatWorkId, title: 'Workbench conversation', goal: prompt },
      session: { id: employee.activeSession.id, messages: employee.activeSession.messages ?? [] },
    });
    this.activeByEmployee.set(employeeId, run.id);
    this.promptRunIds.add(run.id);
    this.persist();
    return run;
  }
  async cancelCurrentWork(employeeId: string) {
    const runId = this.activeByEmployee.get(employeeId);
    if (!runId || !this.ports.host.cancelRun) throw new WeWorkHostError('RUN_NOT_ACTIVE', 'employee has no active run', 409);
    await this.ports.host.cancelRun(runId);
  }
  employeeForRun(runId: string) { return [...this.activeByEmployee].find(([, id]) => id === runId)?.[0]; }
  isPromptRun(runId: string) { return this.promptRunIds.has(runId); }
  async recover() {
    if (!this.ports.host.run) return [];
    const results = [];
    for (const [employeeId, runId] of [...this.activeByEmployee]) {
      try {
        const run = await this.ports.host.run(runId); results.push({ employeeId, runId, status: run.status });
        if (['succeeded', 'failed', 'cancelled'].includes(run.status)) this.markTerminal(employeeId);
      } catch { this.markTerminal(employeeId); }
    }
    return results;
  }
  markTerminal(employeeId: string) { const runId = this.activeByEmployee.get(employeeId); if (runId) this.promptRunIds.delete(runId); this.activeByEmployee.delete(employeeId); this.persist(); }
}
