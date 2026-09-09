import type { ArtifactItem, WeWorkTeam, WorkItem } from '../domain/wework';

export type AgentIdentity = { agentId: string; employeeId: string; teamId: string; runId: string };
export type TeamMessage = { id: string; teamId: string; senderId: string; senderName: string; text: string; createdAt: string };
export type HandoffRequest = { id: string; teamId: string; issueId: string; fromEmployeeId: string; toEmployeeId: string; note?: string; status: 'requested' | 'accepted' | 'rejected'; createdAt: string };
export type PublishedArtifact = ArtifactItem & { teamId: string; issueId: string; producerEmployeeId: string; hash?: string; targetRef?: string };

export type CollaborationEvent =
  | { type: 'issue.claimed'; teamId: string; issueId: string; employeeId: string; runId: string }
  | { type: 'issue.updated'; teamId: string; issueId: string; status: WorkItem['status']; employeeId: string }
  | { type: 'message.created'; teamId: string; message: TeamMessage }
  | { type: 'artifact.published'; teamId: string; artifact: PublishedArtifact }
  | { type: 'handoff.requested'; teamId: string; handoff: HandoffRequest };

export type WeWorkToolName =
  | 'wework.get_current_team'
  | 'wework.list_issues'
  | 'wework.claim_issue'
  | 'wework.update_issue'
  | 'wework.send_team_message'
  | 'wework.publish_artifact'
  | 'wework.request_handoff';

export type WeWorkToolDefinition = { name: WeWorkToolName; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false } };
const objectSchema = (properties: Record<string, unknown>, required?: string[]): WeWorkToolDefinition['inputSchema'] => ({ type: 'object', properties, required, additionalProperties: false });
export const weworkToolDefinitions: readonly WeWorkToolDefinition[] = [
  { name: 'wework.get_current_team', description: 'Read the team scoped to this agent run.', inputSchema: objectSchema({}) },
  { name: 'wework.list_issues', description: 'List issues in the current team, optionally filtered by status.', inputSchema: objectSchema({ status: { type: 'string', enum: ['pending', 'running', 'completed', 'blocked'] } }) },
  { name: 'wework.claim_issue', description: 'Atomically claim an issue for the current employee.', inputSchema: objectSchema({ issueId: { type: 'string' } }, ['issueId']) },
  { name: 'wework.update_issue', description: 'Update issue status and optionally publish a progress summary.', inputSchema: objectSchema({ issueId: { type: 'string' }, status: { type: 'string', enum: ['pending', 'running', 'completed', 'blocked'] }, summary: { type: 'string' } }, ['issueId', 'status']) },
  { name: 'wework.send_team_message', description: 'Post a message to the current team conversation.', inputSchema: objectSchema({ text: { type: 'string', minLength: 1 } }, ['text']) },
  { name: 'wework.publish_artifact', description: 'Register a work artifact with provenance for an issue.', inputSchema: objectSchema({ issueId: { type: 'string' }, artifact: { type: 'object' } }, ['issueId', 'artifact']) },
  { name: 'wework.request_handoff', description: 'Request a durable issue handoff to another employee in the current team.', inputSchema: objectSchema({ issueId: { type: 'string' }, targetEmployeeId: { type: 'string' }, note: { type: 'string' } }, ['issueId', 'targetEmployeeId']) },
];

export type WeWorkToolInput = {
  'wework.get_current_team': Record<string, never>;
  'wework.list_issues': { status?: WorkItem['status'] };
  'wework.claim_issue': { issueId: string };
  'wework.update_issue': { issueId: string; status: WorkItem['status']; summary?: string };
  'wework.send_team_message': { text: string };
  'wework.publish_artifact': { issueId: string; artifact: Omit<ArtifactItem, 'id' | 'createdAt'> & { hash?: string; targetRef?: string } };
  'wework.request_handoff': { issueId: string; targetEmployeeId: string; note?: string };
};

export type WeWorkToolOutput = {
  'wework.get_current_team': WeWorkTeam;
  'wework.list_issues': WorkItem[];
  'wework.claim_issue': WorkItem;
  'wework.update_issue': WorkItem;
  'wework.send_team_message': TeamMessage;
  'wework.publish_artifact': PublishedArtifact;
  'wework.request_handoff': HandoffRequest;
};

export interface CollaborationRepository {
  getTeam(teamId: string): Promise<WeWorkTeam | undefined>;
  listIssues(teamId: string): Promise<WorkItem[]>;
  claimIssue(teamId: string, issueId: string, employeeId: string): Promise<WorkItem>;
  updateIssue(teamId: string, issueId: string, patch: Pick<WorkItem, 'status'>): Promise<WorkItem>;
  createMessage(message: Omit<TeamMessage, 'id' | 'createdAt'>): Promise<TeamMessage>;
  publishArtifact(artifact: Omit<PublishedArtifact, 'id' | 'createdAt'>): Promise<PublishedArtifact>;
  createHandoff(handoff: Omit<HandoffRequest, 'id' | 'createdAt' | 'status'>): Promise<HandoffRequest>;
}

export interface ExternalToolGateway {
  call(server: string, tool: string, input: unknown, identity: AgentIdentity): Promise<unknown>;
}

export type HarnessPolicy = {
  weworkTools: ReadonlySet<WeWorkToolName>;
  externalServers: ReadonlySet<string>;
};

const allWeWorkTools = new Set<WeWorkToolName>([
  'wework.get_current_team', 'wework.list_issues', 'wework.claim_issue', 'wework.update_issue',
  'wework.send_team_message', 'wework.publish_artifact', 'wework.request_handoff',
]);

export const defaultHarnessPolicy = (): HarnessPolicy => ({ weworkTools: new Set(allWeWorkTools), externalServers: new Set() });

export class CollaborationHarness {
  private listeners = new Set<(event: CollaborationEvent) => void>();
  constructor(private ports: { repository: CollaborationRepository; externalTools?: ExternalToolGateway; now?: () => string }) {}
  subscribe(listener: (event: CollaborationEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(event: CollaborationEvent) { this.listeners.forEach((listener) => listener(event)); }
  private async assertIdentity(identity: AgentIdentity) {
    const team = await this.ports.repository.getTeam(identity.teamId);
    if (!team) throw new Error('team not found');
    if (!team.employees.some((employee) => employee.id === identity.employeeId)) throw new Error('agent is not a member of this team');
    return team;
  }
  async call<Name extends WeWorkToolName>(identity: AgentIdentity, policy: HarnessPolicy, name: Name, input: WeWorkToolInput[Name]): Promise<WeWorkToolOutput[Name]> {
    if (!policy.weworkTools.has(name)) throw new Error(`wework tool denied: ${name}`);
    const team = await this.assertIdentity(identity);
    const repository = this.ports.repository;
    let output: WeWorkToolOutput[WeWorkToolName];
    switch (name) {
      case 'wework.get_current_team': output = team; break;
      case 'wework.list_issues': { const { status } = input as WeWorkToolInput['wework.list_issues']; const issues = await repository.listIssues(identity.teamId); output = status ? issues.filter((issue) => issue.status === status) : issues; break; }
      case 'wework.claim_issue': { const issue = await repository.claimIssue(identity.teamId, (input as WeWorkToolInput['wework.claim_issue']).issueId, identity.employeeId); this.emit({ type: 'issue.claimed', teamId: identity.teamId, issueId: issue.id, employeeId: identity.employeeId, runId: identity.runId }); output = issue; break; }
      case 'wework.update_issue': { const value = input as WeWorkToolInput['wework.update_issue']; const issue = await repository.updateIssue(identity.teamId, value.issueId, { status: value.status }); this.emit({ type: 'issue.updated', teamId: identity.teamId, issueId: issue.id, status: issue.status, employeeId: identity.employeeId }); if (value.summary?.trim()) { const message = await repository.createMessage({ teamId: identity.teamId, senderId: identity.employeeId, senderName: team.employees.find((employee) => employee.id === identity.employeeId)?.displayName ?? identity.agentId, text: value.summary.trim() }); this.emit({ type: 'message.created', teamId: identity.teamId, message }); } output = issue; break; }
      case 'wework.send_team_message': { const message = await repository.createMessage({ teamId: identity.teamId, senderId: identity.employeeId, senderName: team.employees.find((employee) => employee.id === identity.employeeId)?.displayName ?? identity.agentId, text: (input as WeWorkToolInput['wework.send_team_message']).text.trim() }); this.emit({ type: 'message.created', teamId: identity.teamId, message }); output = message; break; }
      case 'wework.publish_artifact': { const value = input as WeWorkToolInput['wework.publish_artifact']; const artifact = await repository.publishArtifact({ ...value.artifact, teamId: identity.teamId, issueId: value.issueId, producerEmployeeId: identity.employeeId }); this.emit({ type: 'artifact.published', teamId: identity.teamId, artifact }); output = artifact; break; }
      case 'wework.request_handoff': { const value = input as WeWorkToolInput['wework.request_handoff']; if (!team.employees.some((employee) => employee.id === value.targetEmployeeId)) throw new Error('handoff target is not a member of this team'); const handoff = await repository.createHandoff({ teamId: identity.teamId, issueId: value.issueId, fromEmployeeId: identity.employeeId, toEmployeeId: value.targetEmployeeId, note: value.note }); this.emit({ type: 'handoff.requested', teamId: identity.teamId, handoff }); output = handoff; break; }
    }
    return output as WeWorkToolOutput[Name];
  }
  async callExternal(identity: AgentIdentity, policy: HarnessPolicy, server: string, tool: string, input: unknown) {
    await this.assertIdentity(identity);
    if (!policy.externalServers.has(server)) throw new Error(`external tool server denied: ${server}`);
    if (!this.ports.externalTools) throw new Error('external tool gateway unavailable');
    return this.ports.externalTools.call(server, tool, input, identity);
  }
}

export class MemoryCollaborationRepository implements CollaborationRepository {
  readonly messages: TeamMessage[] = []; readonly artifacts: PublishedArtifact[] = []; readonly handoffs: HandoffRequest[] = [];
  constructor(readonly teams: WeWorkTeam[], private now = () => new Date().toISOString()) {}
  async getTeam(teamId: string) { return this.teams.find((team) => team.id === teamId); }
  async listIssues(teamId: string) { const team = await this.getTeam(teamId); if (!team) return []; return [...team.pendingWorks, ...(team.completedWorks ?? []), ...team.employees.flatMap((employee) => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? [])].filter((work): work is WorkItem => Boolean(work)))]; }
  private async issue(teamId: string, issueId: string) { const issue = (await this.listIssues(teamId)).find((item) => item.id === issueId); if (!issue) throw new Error('issue not found in team'); return issue; }
  async claimIssue(teamId: string, issueId: string, employeeId: string) { const issue = await this.issue(teamId, issueId); if (issue.assignedEmployeeId && issue.assignedEmployeeId !== employeeId) throw new Error('issue already claimed'); issue.assignedEmployeeId = employeeId; issue.status = 'running'; return issue; }
  async updateIssue(teamId: string, issueId: string, patch: Pick<WorkItem, 'status'>) { const issue = await this.issue(teamId, issueId); issue.status = patch.status; return issue; }
  async createMessage(message: Omit<TeamMessage, 'id' | 'createdAt'>) { const created = { ...message, id: crypto.randomUUID(), createdAt: this.now() }; this.messages.push(created); return created; }
  async publishArtifact(artifact: Omit<PublishedArtifact, 'id' | 'createdAt'>) { await this.issue(artifact.teamId, artifact.issueId); const created = { ...artifact, id: crypto.randomUUID(), createdAt: this.now() }; this.artifacts.push(created); return created; }
  async createHandoff(handoff: Omit<HandoffRequest, 'id' | 'createdAt' | 'status'>) { await this.issue(handoff.teamId, handoff.issueId); const created = { ...handoff, id: crypto.randomUUID(), status: 'requested' as const, createdAt: this.now() }; this.handoffs.push(created); return created; }
}
