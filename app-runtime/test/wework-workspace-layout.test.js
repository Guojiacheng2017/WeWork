import assert from 'node:assert/strict';
import test from 'node:test';
import { lstat, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeWorkWorkspaceLayout } from '../src/host/wework-workspace-layout.js';

test('creates an id-based team workspace and independent employee membership workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-documents-'));
  const documents = join(root, 'Documents');
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(documents, 'WeWork'), configRoot: join(documents, '.wework') });

  const teamPaths = await layout.ensureTeam({ id: 'team-cv', name: 'CV Training' });
  const employeePaths = await layout.ensureEmployee({ id: 'team-cv', name: 'CV Training' }, { id: 'employee-01', displayName: 'Reviewer' });

  assert.equal(teamPaths.root, join(documents, 'WeWork', 'team-cv'));
  assert.equal(employeePaths.root, join(documents, 'WeWork', 'team-cv', 'employees', 'employee-01'));
  assert.deepEqual(JSON.parse(await readFile(teamPaths.manifest, 'utf8')), { schemaVersion: 1, id: 'team-cv', name: 'CV Training' });
  assert.deepEqual(JSON.parse(await readFile(employeePaths.manifest, 'utf8')), { schemaVersion: 1, id: 'employee-01', displayName: 'Reviewer', teamId: 'team-cv' });
  for (const path of [teamPaths.root, join(teamPaths.root, '.wework'), teamPaths.chat, teamPaths.context, teamPaths.plans, teamPaths.issues, teamPaths.workflows, teamPaths.skills, teamPaths.settings, teamPaths.employees, teamPaths.shared, teamPaths.artifacts, teamPaths.state, employeePaths.root, join(employeePaths.root, '.wework'), employeePaths.context, employeePaths.sessions, employeePaths.skills, employeePaths.workspace, employeePaths.artifacts]) {
    assert.equal((await stat(path)).isDirectory(), true, path);
    assert.equal((await lstat(path)).isSymbolicLink(), false, path);
  }
});

test('rejects unsafe team and employee IDs before touching the filesystem', async () => {
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: '/tmp/WeWork', configRoot: '/tmp/.wework' });
  assert.throws(() => layout.paths('../escape'), /invalid team id/i);
  assert.throws(() => layout.paths('team', '../../escape'), /invalid employee id/i);
  assert.throws(() => layout.paths('team', ''), /invalid employee id/i);
});

test('keeps mutable display names exclusively in manifests', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-documents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'Documents', 'WeWork'), configRoot: join(root, 'Documents', '.wework') });
  const team = { id: 'team-cv', name: 'CV Training' };
  const employee = { id: 'employee-01', displayName: 'Reviewer' };

  const teamPaths = await layout.ensureTeam(team);
  const employeePaths = await layout.ensureEmployee(team, employee);

  assert.equal(JSON.parse(await readFile(teamPaths.manifest, 'utf8')).name, 'CV Training');
  assert.equal(JSON.parse(await readFile(employeePaths.manifest, 'utf8')).displayName, 'Reviewer');
  assert.doesNotMatch(await readFile(teamPaths.weworkPrompt, 'utf8'), /CV Training/);
  assert.doesNotMatch(await readFile(employeePaths.weworkPrompt, 'utf8'), /Reviewer/);
  assert.doesNotMatch(await readFile(teamPaths.weworkConfig, 'utf8'), /CV Training|Reviewer/);
  assert.doesNotMatch(await readFile(employeePaths.weworkConfig, 'utf8'), /CV Training|Reviewer/);
});

test('preserves customized team and employee config during concurrent initialization', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wework-documents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(root, 'Documents', 'WeWork'), configRoot: join(root, 'Documents', '.wework') });
  const team = { id: 'team-cv', name: 'CV Training' };
  const employee = { id: 'employee-01', displayName: 'Reviewer' };
  const initialized = await Promise.all(Array.from({ length: 12 }, () => layout.ensureEmployee(team, employee)));
  const teamPaths = layout.paths(team.id);
  const employeePaths = initialized[0];
  assert.deepEqual(JSON.parse(await readFile(teamPaths.weworkConfig, 'utf8')), {});
  assert.deepEqual(JSON.parse(await readFile(employeePaths.weworkConfig, 'utf8')), {});
  const teamConfig = '{\n  "theme": "dark"\n}\n';
  const employeeConfig = '{\n  "context": { "maxMessages": 8 }\n}\n';
  await writeFile(teamPaths.weworkConfig, teamConfig);
  await writeFile(employeePaths.weworkConfig, employeeConfig);

  await Promise.all(Array.from({ length: 12 }, () => layout.ensureEmployee(team, employee)));

  assert.equal(await readFile(teamPaths.weworkConfig, 'utf8'), teamConfig);
  assert.equal(await readFile(employeePaths.weworkConfig, 'utf8'), employeeConfig);
});

test('initialization is idempotent and refreshes display-name manifests without replacing WEWORK.md', async (t) => {
  const documents = await mkdtemp(join(tmpdir(), 'wework-documents-'));
  t.after(() => rm(documents, { recursive: true, force: true }));
  const layout = new WeWorkWorkspaceLayout({ weworkRoot: join(documents, 'WeWork'), configRoot: join(documents, '.wework') });
  const paths = await layout.ensureTeam({ id: 'team', name: 'Old name' });
  const customPrompt = '# Team instructions\nKeep this content.';
  await writeFile(paths.weworkPrompt, customPrompt);
  await layout.ensureTeam({ id: 'team', name: 'New name' });
  assert.equal(await readFile(paths.weworkPrompt, 'utf8'), customPrompt);
  assert.equal(JSON.parse(await readFile(paths.manifest, 'utf8')).name, 'New name');
});
