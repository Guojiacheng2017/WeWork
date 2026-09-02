import { createHostWeWorkApi } from './hostWeWorkApi';
import type { WeWorkEmployee, WeWorkTeam, RuntimeProfile, SessionExecution, SkillRef, WorkItem, WorkflowTemplate, WorkspaceAssignment } from '../domain/wework';
import { createLocalWeWorkApi } from '../local/localWeWorkApi';

const BASE = (import.meta.env.VITE_WEWORK_API_URL || '/wework-api').replace(/\/$/, '');

export type WeWorkSnapshot = { teams: WeWorkTeam[]; eventCursor: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WeWork API ${response.status}: ${detail}`);
  }
  return response.json();
}

const remoteWeWorkApi = {
  snapshot: (options?: { includeArchived?: boolean }) => request<WeWorkSnapshot>(`/v1/wework${options?.includeArchived ? '?includeArchived=true' : ''}`),
  listRuntimeProfiles: () => request<{ profiles: RuntimeProfile[] }>('/v1/runtime-profiles'),
  createRuntimeProfile: (body: Omit<RuntimeProfile, 'id' | 'createdAt' | 'updatedAt'>) => request<RuntimeProfile>('/v1/runtime-profiles', { method: 'POST', body: JSON.stringify(body) }),
  bootstrap: (teams: WeWorkTeam[]) => request<{ imported: boolean }>('/v1/bootstrap', { method: 'POST', body: JSON.stringify({ teams }) }),
  createTeam: (body: object) => request<WeWorkTeam>('/v1/teams', { method: 'POST', body: JSON.stringify(body) }),
  archiveTeam: (teamId: string) => request<WeWorkTeam>(`/v1/teams/${teamId}/archive`, { method: 'POST' }),
  restoreTeam: (teamId: string) => request<WeWorkTeam>(`/v1/teams/${teamId}/restore`, { method: 'POST' }),
  deleteTeam: (teamId: string) => request<{ deleted: string; workspaceRetained: true }>(`/v1/teams/${teamId}`, { method: 'DELETE' }),
  updateTeamWorkspace: (teamId: string, workspaceAssignment?: WorkspaceAssignment) => request<WeWorkTeam>(`/v1/teams/${teamId}/workspace`, { method: 'PUT', body: JSON.stringify({ workspaceAssignment }) }),
  addEmployee: (teamId: string, body: object) => request<WeWorkEmployee>(`/v1/teams/${teamId}/employees`, { method: 'POST', body: JSON.stringify(body) }),
  removeEmployee: (teamId: string, employeeId: string) => request(`/v1/teams/${teamId}/employees/${employeeId}`, { method: 'DELETE' }),
  updateEmployee: (employeeId: string, body: { displayName: string; roleName: string; runtime: WeWorkEmployee['runtime']; skills: SkillRef[]; defaultRuntimeProfileId?: string; workspaceAssignment?: WorkspaceAssignment; sessionExecution?: SessionExecution; sessionContextTagIds?: string[]; startNewSession?: boolean }) => {
    const { sessionExecution: _localExecution, sessionContextTagIds: _localTags, startNewSession: _localSessionReset, ...collaborationFields } = body;
    return request<WeWorkEmployee>(`/v1/employees/${employeeId}`, { method: 'PATCH', body: JSON.stringify({ ...collaborationFields, workspaceAssignment: body.workspaceAssignment ?? null }) });
  },
  resetEmployeeContext: (employeeId: string) => request<WeWorkEmployee>(`/v1/employees/${employeeId}/reset-context`, { method: 'POST' }),
  setLead: (teamId: string, employeeId: string) => request(`/v1/teams/${teamId}/lead`, { method: 'POST', body: JSON.stringify({ employeeId }) }),
  createWork: (teamId: string, body: Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category' | 'runtimeProfileId'>) => request(`/v1/teams/${teamId}/works`, { method: 'POST', body: JSON.stringify(body) }),
  assignWork: (workId: string, employeeId: string) => request(`/v1/works/${workId}/assign`, { method: 'POST', body: JSON.stringify({ employeeId }) }),
  updateWork: (workId: string, body: Partial<Pick<WorkItem, 'title' | 'goal' | 'priority' | 'category'>>) => request(`/v1/works/${workId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cancelWork: (workId: string) => request(`/v1/works/${workId}/cancel`, { method: 'POST' }),
  completeCurrent: (employeeId: string) => request(`/v1/employees/${employeeId}/complete-current`, { method: 'POST' }),
  returnCurrent: (employeeId: string) => request(`/v1/employees/${employeeId}/return-current`, { method: 'POST' }),
  getWorkflow: (teamId: string) => request<WorkflowTemplate>(`/v1/teams/${teamId}/workflow`),
  saveWorkflow: (teamId: string, workflow: WorkflowTemplate) => {
    return request<WorkflowTemplate>(`/v1/teams/${teamId}/workflow`, {
      method: 'PUT',
      headers: workflow.version === undefined ? undefined : { 'If-Match': `"${workflow.version}"` },
      body: JSON.stringify(workflow),
    });
  },
  sendMessage: (employeeId: string, text: string) => request(`/v1/employees/${employeeId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  sendAssistantMessage: (employeeId: string, text: string) => request(`/v1/employees/${employeeId}/messages`, { method: 'POST', body: JSON.stringify({ text, sender: 'employee' }) }),
  sendTeamMessage: (teamId: string, text: string, _actor?: unknown, contextTagIds?: string[]) => request(`/v1/teams/${teamId}/messages`, { method: 'POST', body: JSON.stringify({ text, contextTagIds }) }),
  eventSource: (cursor: number) => new EventSource(`${BASE}/v1/events/stream?after=${cursor}`),
};

export const hostManagedWeWork = import.meta.env.VITE_WEWORK_MODE !== 'remote' && Boolean(window.weworkHost && 'weworkCall' in window.weworkHost);
export const localWeWorkApi = hostManagedWeWork
  ? createHostWeWorkApi(window.weworkHost as import('./hostWeWorkApi').HostWeWorkBridge, window.localStorage)
  : createLocalWeWorkApi(window.localStorage);

export const weworkApi = import.meta.env.VITE_WEWORK_MODE === 'remote' ? remoteWeWorkApi : localWeWorkApi;
export const weworkMode = import.meta.env.VITE_WEWORK_MODE === 'remote' ? 'remote' : 'local';
