import { describe, expect, it } from 'vitest';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from './localWeWorkApi';

describe('team capability modules', () => {
  it('keeps a lightweight chat team independent from project management', async () => {
    const api = createLocalWeWorkApi(new MemoryWeWorkStorage());
    const team = await api.createTeam({ name: 'Chat only', runtime: 'Workspace' });

    expect(team.modules).toEqual({ projectManagement: { installed: false, enabled: false, capabilities: [] } });
    expect(team.collaborationDatabase).toBeUndefined();
    await api.sendTeamMessage(team.id, 'hello');
    expect((await api.snapshot()).teams[0].teamMessages?.at(-1)?.text).toBe('hello');
  });

  it('enables explicit capabilities and retains data while disabled', async () => {
    const storage = new MemoryWeWorkStorage();
    const api = createLocalWeWorkApi(storage);
    const team = await api.createTeam({ name: 'Delivery', runtime: 'Workspace' });
    await api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: true, capabilities: ['issues', 'board', 'gantt'] } });
    const issue = await api.createCollaborationWorkItem(team.id, {
      projectId: 'project-main', title: 'Ship registry', description: 'Capability-aware modules',
      statusId: 'status-backlog', priorityId: 'priority-high', startDate: '2026-09-02', dueDate: '2026-09-05',
    });

    await api.updateCollaborationWorkItem(team.id, issue.id, { statusId: 'status-progress', dueDate: '2026-09-06' });
    await api.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: false, capabilities: ['issues', 'board', 'gantt'] } });
    const disabled = (await api.snapshot()).teams[0];
    expect(disabled.collaborationDatabase?.workItems[0]).toMatchObject({ id: issue.id, statusId: 'status-progress', dueDate: '2026-09-06' });
    await expect(api.createCollaborationWorkItem(team.id, { projectId: 'project-main', title: 'Blocked while disabled' })).rejects.toMatchObject({ code: 'CAPABILITY_DISABLED' });

    const restarted = createLocalWeWorkApi(storage);
    await restarted.configureTeamModules(team.id, { projectManagement: { installed: true, enabled: true, capabilities: ['issues', 'board', 'gantt'] } });
    expect((await restarted.snapshot()).teams[0].collaborationDatabase?.workItems[0].id).toBe(issue.id);
  });

  it('migrates legacy teams without loading optional schemas and deletes project data separately', async () => {
    const storage = new MemoryWeWorkStorage();
    storage.setItem('wework.local.v1', JSON.stringify({
      teams: [{ id: 'legacy', name: 'Legacy', description: '', topology: 'roundTable', employees: [], pendingWorks: [] }],
      runtimeProfiles: [], eventCursor: 1,
    }));
    const api = createLocalWeWorkApi(storage);
    expect((await api.snapshot()).teams[0]).toMatchObject({ modules: { projectManagement: { installed: false, enabled: false, capabilities: [] } } });
    expect((await api.snapshot()).teams[0].collaborationDatabase).toBeUndefined();

    await api.configureTeamModules('legacy', { projectManagement: { installed: true, enabled: true, capabilities: ['issues'] } });
    await api.createCollaborationWorkItem('legacy', { projectId: 'project-main', title: 'Persistent issue' });
    await api.deleteCollaborationDatabase('legacy', { confirm: false }).catch((error) => expect(error.code).toBe('CONFIRMATION_REQUIRED'));
    expect((await api.snapshot()).teams[0].collaborationDatabase?.workItems).toHaveLength(1);
    await api.deleteCollaborationDatabase('legacy', { confirm: true });
    expect((await api.snapshot()).teams[0].collaborationDatabase).toBeUndefined();
    expect((await api.snapshot()).teams[0].modules?.projectManagement.enabled).toBe(false);
  });
});
