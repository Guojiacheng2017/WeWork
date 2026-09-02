import { execProcess } from "./process.js";
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

export class MacDirectoryService {
  constructor(ports = {}) { this.cwd = ports.cwd ?? (() => process.cwd()); this.exec = ports.exec ?? execProcess; this.configPath = ports.configPath; }
  async #selectedDirectory() {
    if (!this.configPath) return undefined;
    try {
      const value = JSON.parse(await readFile(this.configPath, 'utf8'));
      if (!value || value.schemaVersion !== 1 || typeof value.rootPath !== 'string' || !isAbsolute(value.rootPath)) throw new Error('invalid persisted current Workspace selection');
      return value.rootPath;
    } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  async #save(rootPath) {
    if (!this.configPath) return;
    await mkdir(dirname(this.configPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.configPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, rootPath }), { mode: 0o600 });
    await rename(temporary, this.configPath);
  }
  async currentDirectory() { return { kind: "local", rootPath: await this.#selectedDirectory() ?? this.cwd() }; }
  async chooseDirectory() {
    const { stdout } = await this.exec("osascript", ["-e", 'POSIX path of (choose folder with prompt "Select WeWork workspace")']);
    const rootPath = stdout.trim();
    if (!rootPath) return null;
    if (!isAbsolute(rootPath)) throw new Error('selected WeWork workspace must be absolute');
    await this.#save(rootPath);
    return { kind: "local", rootPath };
  }
}
