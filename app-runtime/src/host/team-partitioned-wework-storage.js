import { stateHash, stateChanges, replayJournal } from './snapshot-journal.js';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, truncateSync, readdirSync, unlinkSync, copyFileSync, existsSync, mkdirSync, openSync, closeSync, statSync, readFileSync, renameSync, fsyncSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const EMPTY = { schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 };
const parse = (text, fallback) => text ? JSON.parse(text) : structuredClone(fallback);

export const safeTeamDirectory = (teamId) => `team-${createHash('sha256').update(String(teamId)).digest('hex')}`;

export function durableSync(fd, options = {}) {
  const platform = options.platform ?? process.platform;
  const sync = options.sync ?? fsyncSync;
  try { sync(fd); }
  catch (error) {
    if (platform !== 'win32' || error?.code !== 'EPERM') throw error;
  }
}

function atomicWrite(path, value, hooks = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { mode: 0o600 });
  const fd = openSync(temporary, 'r');
  try { durableSync(fd); } finally { closeSync(fd); }
  hooks.beforeRename?.(path, temporary);
  renameSync(temporary, path);
}

/**
 * Compatibility adapter: callers still see one WeWork snapshot while each team is
 * durably stored in its own hash-named directory. The legacy file is copied once
 * before migration and is never overwritten by this store.
 */
export class TeamPartitionedWeWorkStorage {
  constructor(dataRoot, options = {}) {
    this.dataRoot = dataRoot;
    this.legacyPath = options.legacyPath ?? join(dataRoot, 'wework.json');
    this.indexPath = options.indexPath ?? join(dataRoot, 'wework-index.json');
    this.journalPath = `${this.indexPath}.journal`;
    this.snapshotIntervalMs = options.snapshotIntervalMs ?? 60000;
    this.now = options.now ?? Date.now;
    this.lastSnapshotAt = this.now();
    this.teamPath = options.teamPath;
    this.legacyIndexPath = options.legacyIndexPath ?? join(dirname(this.legacyPath), 'wework-index.json');
    this.legacyTeamPath = options.legacyTeamPath ?? ((teamId, file) => join(dirname(this.legacyIndexPath), 'teams', safeTeamDirectory(teamId), file));
    this.legacySources = options.legacySources ?? [{ indexPath: this.legacyIndexPath, legacyPath: this.legacyPath, teamPath: this.legacyTeamPath }];
    this.hooks = options.hooks ?? {};
  }
  getItem() {
    this.#migrateLegacy();
    if (!existsSync(this.indexPath)) return null;
    const signature = (path) => { if (!existsSync(path)) return 'missing'; const stat = statSync(path); return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; };
    if (this.readCache && this.readCache.files.every(([path, stamp]) => signature(path) === stamp)) return this.readCache.value;
    const files = [[this.indexPath, signature(this.indexPath)], [this.journalPath, signature(this.journalPath)]];
    let state = this.#readSnapshot(this.indexPath, (id, file) => {
      const path = this.#teamPath(id, file);
      files.push([path, signature(path)]);
      return path;
    });
    if (existsSync(this.journalPath)) state = replayJournal(state, readFileSync(this.journalPath, 'utf8'));
    const value = JSON.stringify(state);
    this.readCache = { files, value };
    return value;
  }
  #readSnapshot(indexPath, teamPath) {
    const index = parse(readFileSync(indexPath, 'utf8'), EMPTY);
    const entries = index.teams ?? (index.teamIds ?? []).map((id) => ({ id, file: 'team.json' }));
    const teams = entries.map(({ id, file }) => {
      if (file !== 'team.json' && !/^team\.[a-f0-9-]+\.json$/.test(file)) throw new Error('invalid team snapshot index');
      return parse(readFileSync(teamPath(id, file), 'utf8'), null);
    }).filter(Boolean);
    return { schemaVersion: 2, teams, runtimeProfiles: index.runtimeProfiles ?? [], eventCursor: index.eventCursor ?? 0 };
  }
  setItem(_key, value, mode) {
    const state = { ...parse(value, EMPTY), schemaVersion: 2 };
    if (!Array.isArray(state.teams) || !Array.isArray(state.runtimeProfiles)) throw new Error('invalid WeWork snapshot');
    if (state.teams.some((team) => !team || typeof team.id !== 'string' || !team.id) || new Set(state.teams.map((team) => team.id)).size !== state.teams.length) throw new Error('invalid or duplicate team id');
    if (mode === 'stream' && existsSync(this.indexPath) && this.now() - this.lastSnapshotAt < this.snapshotIntervalMs) {
      const before = JSON.parse(this.getItem());
      if (!Number.isSafeInteger(state.eventCursor) || state.eventCursor <= before.eventCursor) throw new Error('stream cursor must advance');
      const changes = stateChanges(before, state);
      if (!changes.length) return;
      const record = JSON.stringify({ cursor: state.eventCursor, before: stateHash(before), after: stateHash(state), changes }) + '\n';
      if (existsSync(this.journalPath)) {
        const bytes = readFileSync(this.journalPath);
        const end = bytes.lastIndexOf(10) + 1;
        if (end !== bytes.length) truncateSync(this.journalPath, end);
      }
      const fd = openSync(this.journalPath, 'a', 0o600);
      try { appendFileSync(fd, record); durableSync(fd); } finally { closeSync(fd); this.readCache = undefined; }
      return;
    }
    this.readCache = undefined;
    const previousIndex = existsSync(this.indexPath) ? readFileSync(this.indexPath, 'utf8') : null;
    const previousEntries = new Map((previousIndex ? JSON.parse(previousIndex).teams ?? [] : []).map(entry => [entry.id, entry.file]));
    const generation = randomUUID();
    const teams = state.teams.map(team => {
      const content = JSON.stringify(team);
      const previousFile = previousEntries.get(team.id);
      if (previousFile && /^(team\.json|team\.[a-f0-9-]+\.json)$/.test(previousFile)) {
        const path = this.#teamPath(team.id, previousFile);
        if (existsSync(path) && readFileSync(path, 'utf8') === content) return { id: team.id, file: previousFile };
      }
      const file = `team.${generation}.json`;
      atomicWrite(this.#teamPath(team.id, file), content, this.hooks);
      return { id: team.id, file };
    });
    const indexValue = JSON.stringify({ schemaVersion: 2, teams, runtimeProfiles: state.runtimeProfiles, eventCursor: state.eventCursor ?? 0 });
    if (indexValue !== previousIndex) atomicWrite(this.indexPath, indexValue, this.hooks);
    this.lastSnapshotAt = this.now();
    // Index promotion precedes journal reset; replay skips already compacted records.
    if (existsSync(this.journalPath)) {
      try { atomicWrite(this.journalPath, '', this.hooks); }
      catch (error) { console.warn('WeWork journal compaction deferred:', error.code ?? error.message); }
    }
    // Only reclaim generations after the complete new snapshot is visible.
    for (const team of teams) {
      try { this.#pruneSnapshots(team, indexValue); }
      catch (error) {
        // A cleanup failure must not turn a committed save into a failed operation.
        console.warn('WeWork snapshot cleanup deferred:', error.code ?? error.message);
      }
    }
  }
  #pruneSnapshots(team, indexValue) {
    const directory = dirname(this.#teamPath(team.id, team.file));
    const previous = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^team\.[a-f0-9-]+\.json$/.test(entry.name) && entry.name !== team.file)
      .map(entry => ({ path: join(directory, entry.name), modified: statSync(join(directory, entry.name)).mtimeMs }))
      .sort((a, b) => b.modified - a.modified || b.path.localeCompare(a.path));
    for (const entry of previous.slice(2)) {
      // If another writer promoted an index, defer to a later save.
      if (readFileSync(this.indexPath, 'utf8') !== indexValue) return;
      unlinkSync(entry.path);
    }
  }
  #teamPath(teamId, file) { return this.teamPath ? this.teamPath(teamId, file) : join(this.dataRoot, 'teams', safeTeamDirectory(teamId), file); }
  #migrateLegacy() {
    if (existsSync(this.indexPath)) return;
    for (const source of this.legacySources) {
      if (source.indexPath !== this.indexPath && existsSync(source.indexPath)) {
        this.setItem('', JSON.stringify(this.#readSnapshot(source.indexPath, source.teamPath)));
        return;
      }
      if (!existsSync(source.legacyPath)) continue;
      const backup = join(dirname(source.legacyPath), `${basename(source.legacyPath)}.v1.backup`);
      if (!existsSync(backup)) copyFileSync(source.legacyPath, backup);
      const raw = readFileSync(source.legacyPath, 'utf8');
      if (!raw.trim()) throw new Error(`legacy WeWork snapshot is empty: ${source.legacyPath}`);
      this.setItem('', JSON.stringify(parse(raw, EMPTY)));
      return;
    }
  }
}
