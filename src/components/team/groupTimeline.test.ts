import { expect, it } from 'vitest';
import { chronologicalEntries } from './groupTimeline';

it('interleaves active executions with messages by creation time, not update time', () => {
  const rows = [
    { id: 'new-message', time: '2026-09-14T03:22:00Z' },
    { id: 'old-message', time: '2026-09-14T03:20:00Z' },
    { id: 'execution', time: '2026-09-14T03:21:00Z', updatedAt: '2026-09-14T04:00:00Z' },
  ];
  expect(chronologicalEntries(rows).map(row => row.id)).toEqual(['old-message', 'execution', 'new-message']);
  expect(rows[0].id).toBe('new-message');
});

it('keeps equal timestamps stable and handles legacy clock times', () => {
  expect(chronologicalEntries([{ id: 'a', time: '11:20' }, { id: 'b', time: '09:00' }, { id: 'c', time: '11:20' }]).map(row => row.id)).toEqual(['b', 'a', 'c']);
});
