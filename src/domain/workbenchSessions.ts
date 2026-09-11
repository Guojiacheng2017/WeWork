import type { EmployeeSession, WeWorkEmployee, WeWorkTeam, WorkItem } from './wework.ts';
export const PRIVATE_TAB = 'private';
export const GROUP_TAB = 'group';
export function workbenchSession(employee: WeWorkEmployee, tabId: string): EmployeeSession | undefined {
  return tabId === PRIVATE_TAB ? employee.activeSession : tabId === GROUP_TAB ? employee.groupSession : employee.workSessions?.[tabId];
}
export function employeeWorks(employee: WeWorkEmployee, team?: WeWorkTeam): WorkItem[] {
  const works = [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? []), ...(team?.completedWorks ?? []).filter(work => work.assignedEmployeeId === employee.id)];
  return works.filter((work, index): work is WorkItem => Boolean(work) && works.findIndex(candidate => candidate?.id === work?.id) === index);
}
export function ensureWorkbenchSession(employee: WeWorkEmployee, team: WeWorkTeam, tabId: string): EmployeeSession {
  const existing = workbenchSession(employee, tabId);
  if (existing) return existing;
  const work = employeeWorks(employee, team).find(work => work.id === tabId);
  if (tabId !== GROUP_TAB && !work) throw new Error('该工作不属于此助手');
  const session: EmployeeSession = {
    id: tabId === GROUP_TAB ? `${team.weworkSessionId ?? team.id}-group-${employee.id}-${employee.activeSession.id}` : `${employee.activeSession.id}-${tabId}`,
    title: work?.title ?? '群聊', messages: [], metrics: [], contextRatio: 0, updatedAt: new Date().toISOString(),
    execution: employee.activeSession.execution ? structuredClone(employee.activeSession.execution) : undefined,
    permissionMode: employee.activeSession.permissionMode, contextTagIds: [...(employee.activeSession.contextTagIds ?? [])],
  };
  if (tabId === GROUP_TAB) employee.groupSession = session;
  else (employee.workSessions ??= {})[tabId] = session;
  return session;
}
export function employeeSessions(employee: WeWorkEmployee) {
  return [employee.activeSession, ...(employee.groupSession ? [employee.groupSession] : []), ...Object.values(employee.workSessions ?? {})];
}
