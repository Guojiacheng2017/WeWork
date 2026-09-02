import { describe, expect, it } from 'vitest';
import { createCollaborationDatabase } from '../../domain/collaboration';
import { projectViewModel } from './projectViewModel';

describe('shared project view model', () => {
  it('projects one work item consistently into issues, board and gantt', () => {
    const database = createCollaborationDatabase('2026-09-02T00:00:00.000Z');
    database.workItems.push({
      id: 'item-1', projectId: 'project-main', title: 'Registry', description: '', statusId: 'status-progress', priorityId: 'priority-high',
      labelIds: [], assigneeIds: [], startDate: '2026-09-02', dueDate: '2026-09-06', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
    });

    const model = projectViewModel(database);
    expect(model.issues[0]).toMatchObject({ id: 'item-1', statusName: '进行中', dueDate: '2026-09-06' });
    expect(model.board.find((column) => column.id === 'status-progress')?.items[0].id).toBe('item-1');
    expect(model.gantt[0]).toMatchObject({ id: 'item-1', startDate: '2026-09-02', dueDate: '2026-09-06' });
  });
});
