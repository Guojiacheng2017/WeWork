import { describe, expect, it } from 'vitest';
import type { WeWorkTeam, WorkItem } from '../../domain/wework';
import { findParticipationWork } from './ParticipationDetail';

describe('participation work references', () => {
  it('resolves the exact work, including after completion, rather than the employees current task', () => {
    const finished = { id: 'finished', status: 'completed' } as WorkItem;
    const team = { pendingWorks: [], employees: [{ currentWorkItem: { id: 'other' }, completedWorkItems: [finished] }] } as unknown as WeWorkTeam;
    expect(findParticipationWork(team, 'finished')).toBe(finished);
    expect(findParticipationWork(team, 'missing')).toBeUndefined();
    expect(findParticipationWork(team)).toBeUndefined();
  });
});
