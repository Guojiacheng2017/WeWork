import { describe, expect, it, vi } from 'vitest';
import type { WeWorkTeam, WorkItem } from '../domain/wework';
import { CollaborationHarness, MemoryCollaborationRepository, defaultHarnessPolicy, type AgentIdentity } from './collaborationHarness';

const issue = (id: string): WorkItem => ({ id, title: id, goal: 'test', status: 'pending', priority: 'medium', category: 'Digital', createdAt: 'now' });
const team = (): WeWorkTeam => ({
  id: 'team-a', name: 'Team A', description: '', topology: 'roundTable', pendingWorks: [issue('issue-1')],
  employees: [{ id: 'employee-a', displayName: 'Agent A', roleName: 'Builder', color: '#000', status: 'idle', runtime: 'Pi', builtInSkills: [], activeSession: { id: 'session-a', contextRatio: 0, updatedAt: 'now', messages: [], metrics: [] }, artifacts: [] }, { id: 'employee-b', displayName: 'Agent B', roleName: 'Reviewer', color: '#111', status: 'idle', runtime: 'Pi', builtInSkills: [], activeSession: { id: 'session-b', contextRatio: 0, updatedAt: 'now', messages: [], metrics: [] }, artifacts: [] }],
});
const identity: AgentIdentity = { agentId: 'agent-a', employeeId: 'employee-a', teamId: 'team-a', runId: 'run-1' };

describe('CollaborationHarness', () => {
  it('scopes tools to a team member and enforces policy', async () => {
    const harness = new CollaborationHarness({ repository: new MemoryCollaborationRepository([team()]) });
    const defaults = defaultHarnessPolicy(); const policy = { ...defaults, weworkTools: new Set([...defaults.weworkTools].filter((name) => name !== 'wework.update_issue')) };
    await expect(harness.call({ ...identity, employeeId: 'outsider' }, policy, 'wework.list_issues', {})).rejects.toThrow('not a member');
    await expect(harness.call(identity, policy, 'wework.update_issue', { issueId: 'issue-1', status: 'completed' })).rejects.toThrow('denied');
  });

  it('claims atomically, emits progress, and prevents a second owner', async () => {
    const repository = new MemoryCollaborationRepository([team()]); const harness = new CollaborationHarness({ repository }); const events: string[] = [];
    harness.subscribe((event) => events.push(event.type));
    const claimed = await harness.call(identity, defaultHarnessPolicy(), 'wework.claim_issue', { issueId: 'issue-1' });
    expect(claimed).toMatchObject({ assignedEmployeeId: 'employee-a', status: 'running' }); expect(events).toEqual(['issue.claimed']);
    await expect(harness.call({ ...identity, employeeId: 'employee-b' }, defaultHarnessPolicy(), 'wework.claim_issue', { issueId: 'issue-1' })).rejects.toThrow('already claimed');
  });

  it('coordinates messages, artifacts, and handoffs through events', async () => {
    const repository = new MemoryCollaborationRepository([team()], () => '2026-08-27T00:00:00Z'); const harness = new CollaborationHarness({ repository }); const events: string[] = [];
    harness.subscribe((event) => events.push(event.type));
    await harness.call(identity, defaultHarnessPolicy(), 'wework.send_team_message', { text: 'ready for review' });
    await harness.call(identity, defaultHarnessPolicy(), 'wework.publish_artifact', { issueId: 'issue-1', artifact: { name: 'report.md', type: 'report', size: '1 KB' } });
    const handoff = await harness.call(identity, defaultHarnessPolicy(), 'wework.request_handoff', { issueId: 'issue-1', targetEmployeeId: 'employee-b', note: 'please review' });
    expect(handoff).toMatchObject({ fromEmployeeId: 'employee-a', toEmployeeId: 'employee-b', status: 'requested' });
    expect(events).toEqual(['message.created', 'artifact.published', 'handoff.requested']);
  });

  it('keeps MCP-style external tools behind an allowlisted gateway', async () => {
    const externalTools = { call: vi.fn(async () => ({ ok: true })) }; const harness = new CollaborationHarness({ repository: new MemoryCollaborationRepository([team()]), externalTools });
    await expect(harness.callExternal(identity, defaultHarnessPolicy(), 'github', 'create_issue', {})).rejects.toThrow('denied');
    const defaults = defaultHarnessPolicy(); const policy = { ...defaults, externalServers: new Set(['github']) };
    await expect(harness.callExternal(identity, policy, 'github', 'create_issue', { title: 'Bug' })).resolves.toEqual({ ok: true });
    expect(externalTools.call).toHaveBeenCalledWith('github', 'create_issue', { title: 'Bug' }, identity);
  });
});
