import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
const safe = (id) => id.replace(/[^a-zA-Z0-9._-]/g, "_");
export class CheckpointStore {
  constructor(root) { this.root = root; }
  async writeJson(path, value) { await mkdir(this.root, { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await rename(temp, path); }
  async readJson(path) { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
  runPath(id) { return join(this.root, `run-${safe(id)}.json`); }
  checkpointPath(id) { return join(this.root, `checkpoint-${safe(id)}.json`); }
  putRun(run) { return this.writeJson(this.runPath(run.id), run); }
  getRun(id) { return this.readJson(this.runPath(id)); }
  putCheckpoint(employeeId, checkpoint) { return this.writeJson(this.checkpointPath(employeeId), checkpoint); }
  getCheckpoint(employeeId) { return this.readJson(this.checkpointPath(employeeId)); }
}
