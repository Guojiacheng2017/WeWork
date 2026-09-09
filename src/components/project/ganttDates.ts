const DAY = 86_400_000;
export const dateNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
export const dateString = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export function shiftSchedule(start: string, due: string, days: number, resize = false) {
  const first = dateNumber(start), last = dateNumber(due);
  return resize ? { startDate: start, dueDate: dateString(Math.max(first, last + days)) } : { startDate: dateString(first + days), dueDate: dateString(last + days) };
}
