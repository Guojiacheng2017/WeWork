import { HostError } from './errors.js';

const rows = (value) => Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : [];
const cleanBaseUrl = (value) => {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new HostError('PLANE_CONFIG_INVALID', 'Plane 实例地址无效', 400);
  return url.toString().replace(/\/$/, '');
};
const segment = (value, label) => {
  const result = String(value ?? '').trim();
  if (!result || result.includes('/') || result.includes('..')) throw new HostError('PLANE_CONFIG_INVALID', `${label} 无效`, 400);
  return encodeURIComponent(result);
};

export class PlaneClient {
  constructor({ baseUrl, workspaceSlug, projectId, apiKey, fetch: fetchImpl = fetch }) {
    this.baseUrl = cleanBaseUrl(baseUrl); this.workspaceSlug = segment(workspaceSlug, 'Workspace slug');
    this.projectId = segment(projectId, 'Project ID'); this.apiKey = apiKey; this.fetch = fetchImpl;
    if (!apiKey) throw new HostError('CREDENTIAL_MISSING', 'Plane API Key 不可用', 409);
  }
  path(suffix = '') { return `${this.baseUrl}/api/v1/workspaces/${this.workspaceSlug}/projects/${this.projectId}${suffix}`; }
  async request(path, init) {
    const response = await this.fetch(path, { ...init, headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json', ...init?.headers } });
    if (!response.ok) {
      const detail = await response.text();
      throw new HostError('PLANE_API_FAILED', `Plane ${response.status}: ${detail.slice(0, 240)}`, response.status >= 500 ? 502 : 409);
    }
    return response.status === 204 ? null : response.json();
  }
  async snapshot() {
    const [project, workItems, states, labels] = await Promise.all([
      this.request(this.path('/')), this.request(this.path('/work-items/?per_page=100')),
      this.request(this.path('/states/')), this.request(this.path('/labels/')),
    ]);
    const timestamp = new Date().toISOString();
    return {
      schemaVersion: 1,
      projects: [{ id: project.id, name: project.name, description: project.description ?? '', createdAt: project.created_at ?? timestamp, updatedAt: project.updated_at ?? timestamp }],
      workItems: rows(workItems).map((item) => ({ id: item.id, projectId: item.project ?? project.id, title: item.name, description: item.description_stripped ?? '', statusId: typeof item.state === 'object' ? item.state.id : item.state, priorityId: `priority-${item.priority ?? 'none'}`, cycleId: typeof item.cycle === 'object' ? item.cycle.id : item.cycle ?? undefined, labelIds: rows(item.labels).map((label) => typeof label === 'string' ? label : label.id), assigneeIds: rows(item.assignees).map((person) => typeof person === 'string' ? person : person.id), startDate: item.start_date ?? undefined, dueDate: item.target_date ?? undefined, createdAt: item.created_at ?? timestamp, updatedAt: item.updated_at ?? timestamp })),
      cycles: [], milestones: [], assignees: [], relations: [], comments: [], activities: [],
      statuses: rows(states).map((state, position) => ({ id: state.id, name: state.name, category: ({ backlog: 'backlog', unstarted: 'unstarted', started: 'started', completed: 'completed', cancelled: 'cancelled' })[state.group] ?? 'unstarted', color: state.color ?? '#94a3b8', position: state.sequence ?? position })),
      priorities: [['none', 0, '#94a3b8'], ['low', 1, '#64748b'], ['medium', 2, '#f59e0b'], ['high', 3, '#ef4444'], ['urgent', 4, '#dc2626']].map(([name, level, color]) => ({ id: `priority-${name}`, name, level, color })),
      labels: rows(labels).map((label) => ({ id: label.id, name: label.name, color: label.color ?? '#64748b' })),
    };
  }
  createWorkItem(title) { return this.request(this.path('/work-items/'), { method: 'POST', body: JSON.stringify({ name: title }) }); }
  updateWorkItem(id, patch) {
    const body = {};
    if (patch.title !== undefined) body.name = patch.title;
    if (patch.description !== undefined) body.description_html = patch.description;
    if (patch.statusId !== undefined) body.state = patch.statusId;
    if (patch.priorityId !== undefined) body.priority = String(patch.priorityId).replace(/^priority-/, '');
    if (patch.startDate !== undefined) body.start_date = patch.startDate;
    if (patch.dueDate !== undefined) body.target_date = patch.dueDate;
    if (patch.labelIds !== undefined) body.labels = patch.labelIds;
    if (patch.assigneeIds !== undefined) body.assignees = patch.assigneeIds;
    return this.request(this.path(`/work-items/${segment(id, 'Work item ID')}/`), { method: 'PATCH', body: JSON.stringify(body) });
  }
}

