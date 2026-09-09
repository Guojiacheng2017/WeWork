import { expect, it } from 'vitest';
import { shiftSchedule } from './ganttDates';
it('moves schedules across month and year boundaries preserving duration', () => {
  expect(shiftSchedule('2026-12-30','2027-01-02',3)).toEqual({startDate:'2027-01-02',dueDate:'2027-01-05'});
});
it('resizes the end without crossing the start', () => {
  expect(shiftSchedule('2026-09-07','2026-09-09',-5,true)).toEqual({startDate:'2026-09-07',dueDate:'2026-09-07'});
});
it('moves backward across leap day without local timezone drift', () => {
  expect(shiftSchedule('2024-03-01','2024-03-02',-1)).toEqual({startDate:'2024-02-29',dueDate:'2024-03-01'});
});
