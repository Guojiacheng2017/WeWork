import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function archiveBusinessState({ storage, weworkRoot, archiveRoot, now = () => new Date() }) {
  const raw = storage.getItem();
  const state = raw ? JSON.parse(raw) : { schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 };
  if (!state.teams.length) return { archived: false, teamCount: 0 };
  if (state.teams.some((team) => !safeId.test(team.id))) throw new Error('refusing to archive unsafe team id');

  const stamp = now().toISOString().replace(/[:.]/g, '-');
  const destination = join(archiveRoot, stamp);
  mkdirSync(join(destination, 'teams'), { recursive: true, mode: 0o700 });
  const snapshotPath = join(destination, 'business-snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });

  for (const team of state.teams) {
    const source = join(weworkRoot, team.id);
    if (existsSync(source)) cpSync(source, join(destination, 'teams', team.id), { recursive: true, errorOnExist: true });
  }
  const verified = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  if (verified.teams.length !== state.teams.length) throw new Error('business archive verification failed');

  storage.setItem('', JSON.stringify({ schemaVersion: 2, teams: [], runtimeProfiles: [], eventCursor: 0 }));
  return { archived: true, teamCount: state.teams.length, destination };
}
