import type { CollaborationDatabase } from '../../domain/collaboration';

export function projectViewModel(database: CollaborationDatabase) {
  const issues = database.workItems.map((item) => ({
    ...item,
    statusName: database.statuses.find((status) => status.id === item.statusId)?.name ?? item.statusId,
    priorityName: database.priorities.find((priority) => priority.id === item.priorityId)?.name ?? item.priorityId,
  }));
  return {
    issues,
    board: [...database.statuses].sort((a, b) => a.position - b.position).map((status) => ({ ...status, items: issues.filter((item) => item.statusId === status.id) })),
    gantt: issues.filter((item) => item.startDate || item.dueDate).map((item) => ({ ...item, startDate: item.startDate, dueDate: item.dueDate })),
  };
}
