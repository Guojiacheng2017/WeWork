import { access, readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

export async function harnessExecutableCandidates(command, { platform = process.platform, environment = process.env, home = homedir(), readDirectory = readdir } = {}) {
  const names = platform === 'win32' ? [`${command}.exe`, `${command}.cmd`, command] : [command];
  const directories = String(environment.PATH ?? environment.Path ?? '').split(delimiter).filter(Boolean);
  if (platform !== 'win32') {
    if (platform === 'darwin') directories.push('/opt/homebrew/bin', '/usr/local/bin');
    if (home) directories.push(join(home, '.local', 'bin'), join(home, '.volta', 'bin'), join(home, '.asdf', 'shims'), join(home, '.bun', 'bin'), join(home, '.fnm', 'aliases', 'default', 'bin'));
    if (home) try {
      const versions = await readDirectory(join(home, '.nvm', 'versions', 'node'), { withFileTypes: true });
      directories.push(...versions.filter((entry) => entry.isDirectory()).map((entry) => join(home, '.nvm', 'versions', 'node', entry.name, 'bin')).sort().reverse());
    } catch {}
  }
  return [...new Set(directories.flatMap((directory) => names.map((name) => join(directory, name))))];
}

export async function resolveHarnessExecutable(command, options = {}) {
  if (options.executablePath) { await (options.accessPath ?? access)(options.executablePath); return options.executablePath; }
  for (const path of await harnessExecutableCandidates(command, options)) try { await (options.accessPath ?? access)(path); return path; } catch {}
  const error = new Error(`${command} executable was not found on this device`);
  error.code = 'HARNESS_NOT_INSTALLED';
  throw error;
}
