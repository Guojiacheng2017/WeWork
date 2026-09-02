import { link, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const assertId = (kind, value) => {
  if (!validId.test(value ?? '')) throw new Error(`invalid ${kind} id`);
  return value;
};

async function publishJson(path, value, publish) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let handle;
  let ownsTemporary = false;
  let failure;
  try {
    handle = await open(temporary, 'wx', 0o600);
    ownsTemporary = true;
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.close();
    handle = undefined;
    await publish(temporary, path);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    let cleanupError;
    if (handle) {
      try { await handle.close(); }
      catch (error) { cleanupError = error; }
    }
    if (ownsTemporary) {
      try { await rm(temporary, { force: true }); }
      catch (error) { cleanupError ??= error; }
    }
    if (!failure && cleanupError) throw cleanupError;
  }
}

async function writeJson(path, value) {
  await publishJson(path, value, rename);
}

async function writeJsonOnce(path, value) {
  try { await publishJson(path, value, link); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function writeOnce(path, content) {
  try { await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, content, { mode: 0o600 });
  }
}

export class WeWorkWorkspaceLayout {
  constructor({ weworkRoot, configRoot }) {
    this.weworkRoot = weworkRoot;
    this.configRoot = configRoot;
  }

  paths(teamId, employeeId) {
    assertId('team', teamId);
    const root = join(this.weworkRoot, teamId);
    const team = {
      root, manifest: join(root, 'team.json'), weworkPrompt: join(root, 'WEWORK.md'), weworkConfig: join(root, '.wework', 'config.json'),
      chat: join(root, 'team', 'chat'), context: join(root, 'team', 'context'), plans: join(root, 'team', 'plans'),
      issues: join(root, 'team', 'issues'), workflows: join(root, 'team', 'workflows'), skills: join(root, 'team', 'skills'), settings: join(root, 'team', 'settings'),
      employees: join(root, 'employees'), shared: join(root, 'shared'), artifacts: join(root, 'artifacts'), state: join(root, '.wework-state'),
    };
    if (employeeId === undefined) return team;
    assertId('employee', employeeId);
    const employeeRoot = join(team.employees, employeeId);
    return { ...team, teamRoot: root, root: employeeRoot, manifest: join(employeeRoot, 'employee.json'), weworkPrompt: join(employeeRoot, 'WEWORK.md'), weworkConfig: join(employeeRoot, '.wework', 'config.json'), context: join(employeeRoot, 'context'), sessions: join(employeeRoot, 'sessions'), skills: join(employeeRoot, 'skills'), workspace: join(employeeRoot, 'workspace'), artifacts: join(employeeRoot, 'artifacts') };
  }

  async ensureTeam(team) {
    const paths = this.paths(team.id);
    for (const path of [paths.root, join(paths.root, '.wework'), paths.chat, paths.context, paths.plans, paths.issues, paths.workflows, paths.skills, paths.settings, paths.employees, paths.shared, paths.artifacts, paths.state]) await mkdir(path, { recursive: true, mode: 0o700 });
    await writeJson(paths.manifest, { schemaVersion: 1, id: team.id, name: team.name });
    await writeOnce(paths.weworkPrompt, '# Team instructions\n\nTeam-level instructions for WeWork employees.\n');
    await writeJsonOnce(paths.weworkConfig, {});
    return paths;
  }

  async ensureEmployee(team, employee) {
    await this.ensureTeam(team);
    const paths = this.paths(team.id, employee.id);
    for (const path of [paths.root, join(paths.root, '.wework'), paths.context, paths.sessions, paths.skills, paths.workspace, paths.artifacts]) await mkdir(path, { recursive: true, mode: 0o700 });
    await writeJson(paths.manifest, { schemaVersion: 1, id: employee.id, displayName: employee.displayName, teamId: team.id });
    await writeOnce(paths.weworkPrompt, '# Employee instructions\n\nEmployee persona and working instructions.\n');
    await writeJsonOnce(paths.weworkConfig, {});
    return paths;
  }
}
