import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readZip, writeZip } from './zip-store.js';

const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const portableRoot = '$WEWORK_ROOT/';
const inside = (root, candidate) => { const path = relative(resolve(root), resolve(candidate)); return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)); };
const portablePath = (root, value) => inside(root, value) ? `${portableRoot}${relative(root, value).split(sep).join('/')}` : undefined;
const destinationPath = (root, value) => typeof value === 'string' && value.startsWith(portableRoot) ? join(root, ...value.slice(portableRoot.length).split('/')) : undefined;

function portableSnapshot(state, weworkRoot) {
  const value = structuredClone(state);
  let rebindCount = 0;
  const clean = (input) => {
    if (!input || typeof input !== 'object') return;
    if (Object.hasOwn(input, 'credentialRef')) { delete input.credentialRef; rebindCount += 1; }
    if (Object.hasOwn(input, 'apiKeyEnv')) { delete input.apiKeyEnv; }
    if (input.workspaceAssignment?.kind === 'local') {
      const rootPath = portablePath(weworkRoot, input.workspaceAssignment.rootPath);
      if (rootPath) input.workspaceAssignment.rootPath = rootPath;
      else { delete input.workspaceAssignment; rebindCount += 1; }
    }
    for (const child of Object.values(input)) if (child && typeof child === 'object') clean(child);
  };
  clean(value);
  return { value, rebindCount };
}

function restoreSnapshot(state, weworkRoot) {
  const value = structuredClone(state);
  const visit = (input) => {
    if (!input || typeof input !== 'object') return;
    if (input.workspaceAssignment?.kind === 'local') {
      const rootPath = destinationPath(weworkRoot, input.workspaceAssignment.rootPath);
      if (!rootPath) delete input.workspaceAssignment;
      else input.workspaceAssignment.rootPath = rootPath;
    }
    for (const child of Object.values(input)) if (child && typeof child === 'object') visit(child);
  };
  visit(value);
  return value;
}

async function files(root, prefix, output) {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    if (entry.name === '.wework-state' || entry.isSymbolicLink()) continue;
    const path = join(root, entry.name); const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await files(path, name, output);
    else if (entry.isFile()) output.push({ name, data: await readFile(path) });
  }
}

export async function exportWorkspaceZip({ archivePath, weworkRoot, storage, teamId, now = () => new Date() }) {
  const complete = JSON.parse(storage.getItem() || '{"schemaVersion":2,"teams":[],"runtimeProfiles":[],"eventCursor":0}');
  const state = teamId ? { ...complete, teams: complete.teams.filter(team => team.id === teamId) } : complete;
  if (teamId && !state.teams.length) throw new Error(`找不到要导出的团队：${teamId}`);
  if (!state.teams.length) throw new Error('没有可导出的团队');
  if (state.teams.some(team => !safeId.test(team.id))) throw new Error('团队 ID 无法安全导出');
  const portable = portableSnapshot(state, weworkRoot);
  const entries = [
    { name: 'manifest.json', data: JSON.stringify({ format: 'wework-transfer', version: 1, exportedAt: now().toISOString(), teamIds: state.teams.map(team => team.id), rebindCount: portable.rebindCount }, null, 2) },
    { name: 'snapshot.json', data: JSON.stringify(portable.value) },
  ];
  for (const team of state.teams) await files(join(weworkRoot, team.id), `workspace/${team.id}`, entries);
  await mkdir(dirname(archivePath), { recursive: true });
  await writeZip(archivePath, entries);
  return { archivePath, teamCount: state.teams.length, rebindCount: portable.rebindCount };
}

export async function importWorkspaceZip({ archivePath, weworkRoot, storage }) {
  const entries = await readZip(archivePath);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString() ?? 'null');
  const importedRaw = JSON.parse(entries.get('snapshot.json')?.toString() ?? 'null');
  if (manifest?.format !== 'wework-transfer' || manifest.version !== 1 || !Array.isArray(importedRaw?.teams)) throw new Error('不是有效的 WeWork 导出包');
  if (importedRaw.teams.some(team => !safeId.test(team.id)) || importedRaw.teams.some(team => !manifest.teamIds.includes(team.id))) throw new Error('导出包团队信息无效');
  const current = JSON.parse(storage.getItem() || '{"schemaVersion":2,"teams":[],"runtimeProfiles":[],"eventCursor":0}');
  const duplicate = importedRaw.teams.find(team => current.teams.some(existing => existing.id === team.id));
  if (duplicate) throw new Error(`已存在同 ID 团队：${duplicate.id}`);
  const profileIds = new Set(current.runtimeProfiles.map(profile => profile.id));
  const importedProfiles = (importedRaw.runtimeProfiles ?? []).filter(profile => !profileIds.has(profile.id));
  const imported = restoreSnapshot(importedRaw, weworkRoot);
  const temporary = join(weworkRoot, `.import-${randomUUID()}`);
  await mkdir(temporary, { recursive: true, mode: 0o700 });
  const moved = [];
  try {
    for (const [name, data] of entries) {
      if (!name.startsWith('workspace/')) continue;
      const relativeName = name.slice('workspace/'.length);
      const [teamId] = relativeName.split('/');
      if (!manifest.teamIds.includes(teamId)) throw new Error('ZIP Workspace 路径与团队不匹配');
      const destination = resolve(temporary, relativeName);
      if (!inside(temporary, destination)) throw new Error('ZIP Workspace 路径不安全');
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, data, { mode: 0o600 });
    }
    await mkdir(weworkRoot, { recursive: true, mode: 0o700 });
    for (const team of imported.teams) {
      const source = join(temporary, team.id); const destination = join(weworkRoot, team.id);
      try { await stat(destination); throw new Error(`目标工作目录已存在：${team.id}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await lstat(source); } catch (error) { if (error.code === 'ENOENT') await mkdir(source, { recursive: true }); else throw error; }
      await rename(source, destination); moved.push(destination);
    }
    storage.setItem('', JSON.stringify({ schemaVersion: 2, teams: [...current.teams, ...imported.teams], runtimeProfiles: [...current.runtimeProfiles, ...importedProfiles], eventCursor: Math.max(current.eventCursor ?? 0, imported.eventCursor ?? 0) }));
  } catch (error) {
    await Promise.all(moved.map(path => rm(path, { recursive: true, force: true })));
    throw error;
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { teamCount: imported.teams.length, rebindCount: manifest.rebindCount ?? 0 };
}
