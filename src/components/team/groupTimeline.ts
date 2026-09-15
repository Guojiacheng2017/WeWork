/** Use creation time, never progress/update time, so active rows stay in place. */
export function chronologicalEntries<T extends { time: string }>(entries: T[]): T[] {
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    // Legacy messages may only have a local clock time.
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    return clock ? (+clock[1] * 3600 + +clock[2] * 60 + +(clock[3] ?? 0)) * 1000 : 0;
  };
  return [...entries].sort((a, b) => timestamp(a.time) - timestamp(b.time));
}
