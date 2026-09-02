import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, fsyncSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const EMPTY = { schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 };
const parse = (text, fallback) => text ? JSON.parse(text) : structuredClone(fallback);

export const safeTeamDirectory = (teamId) => `team-${createHash('sha256').update(String(teamId)).digest('hex')}`;

function atomicWrite(path, value, hooks = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { mode: 0o600 });
  const fd = openSync(temporary, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
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
    this.teamPath = options.teamPath;
    this.legacyIndexPath = options.legacyIndexPath ?? join(dirname(this.legacyPath), 'wework-index.json');
    this.legacyTeamPath = options.legacyTeamPath ?? ((teamId, file) => join(dirname(this.legacyIndexPath), 'teams', safeTeamDirectory(teamId), file));
    this.legacySources = options.legacySources ?? [{ indexPath: this.legacyIndexPath, legacyPath: this.legacyPath, teamPath: this.legacyTeamPath }];
    this.hooks = options.hooks ?? {};
  }
  getItem() {
    this.#migrateLegacy();
    if (!existsSync(this.indexPath)) return null;
    return JSON.stringify(this.#readSnapshot(this.indexPath, (id, file) => this.#teamPath(id, file)));
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
  setItem(_key, value) {
    const state = parse(value, EMPTY);
    if (!Array.isArray(state.teams) || !Array.isArray(state.runtimeProfiles)) throw new Error('invalid WeWork snapshot');
    if (state.teams.some((team) => !team || typeof team.id !== 'string' || !team.id) || new Set(state.teams.map((team) => team.id)).size !== state.teams.length) throw new Error('invalid or duplicate team id');
    const generation = randomUUID();
    const teams = state.teams.map((team) => ({ id: team.id, file: `team.${generation}.json` }));
    for (let index = 0; index < state.teams.length; index += 1) atomicWrite(this.#teamPath(state.teams[index].id, teams[index].file), JSON.stringify(state.teams[index]), this.hooks);
    atomicWrite(this.indexPath, JSON.stringify({ schemaVersion: 2, teams, runtimeProfiles: state.runtimeProfiles, eventCursor: state.eventCursor ?? 0 }), this.hooks);
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
