import { createHash } from 'node:crypto';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const stateHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Text appends stay small even when an assistant message has a long history.
export function stateChanges(before, after, path = [], changes = []) {
  if (before === after) return changes;
  if (typeof before === 'string' && typeof after === 'string' && after.startsWith(before)) {
    changes.push({ path, append: after.slice(before.length) });
  } else if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after) && (!Array.isArray(before) || after.length >= before.length)) {
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) changes.push({ path: [...path, key], remove: true });
    for (const key of Object.keys(after)) stateChanges(before[key], after[key], [...path, key], changes);
  } else changes.push({ path, value: after });
  return changes;
}

export function applyChanges(state, changes) {
  for (const change of changes) {
    if (!Array.isArray(change.path) || change.path.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('invalid snapshot journal path');
    if (!change.path.length) { state = change.value; continue; }
    let target = state;
    for (const key of change.path.slice(0, -1)) {
      if (!Object.hasOwn(target, key)) throw new Error('missing snapshot journal target');
      target = target[key];
    }
    const key = change.path.at(-1);
    if (change.remove) delete target[key];
    else if (Object.hasOwn(change, 'append')) {
      if (typeof target[key] !== 'string') throw new Error('invalid snapshot journal append');
      target[key] += change.append;
    } else target[key] = change.value;
  }
  return state;
}

export function replayJournal(state, text) {
  // An interrupted final append has no newline and was never acknowledged.
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  const records = complete.split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (!records.length) return state;
  for (const record of records) {
    if (!Number.isSafeInteger(record.cursor)) throw new Error('invalid snapshot journal cursor');
    if (record.cursor <= state.eventCursor) continue;
    if (stateHash(state) !== record.before) throw new Error('snapshot journal does not match snapshot');
    state = applyChanges(state, record.changes);
    if (state.eventCursor !== record.cursor || stateHash(state) !== record.after) throw new Error('snapshot journal checksum mismatch');
  }
  return state;
}
