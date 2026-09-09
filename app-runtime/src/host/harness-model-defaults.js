import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ALLOWED = new Set(['pi']);

export class HarnessModelDefaultStore {
  constructor(path) { this.path = path; }
  async get() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      const defaults = {};
      for (const [harness, modelId] of Object.entries(value?.defaults ?? {})) {
        if (ALLOWED.has(harness) && typeof modelId === 'string' && modelId) defaults[harness] = modelId;
      }
      return defaults;
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async set(harness, modelId) {
    if (!ALLOWED.has(harness) || typeof modelId !== 'string' || !modelId) throw Object.assign(new Error('Harness model default is invalid'), { code: 'MODEL_CONFIG_INVALID' });
    const defaults = { ...(await this.get()), [harness]: modelId };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ defaults }, null, 2), { mode: 0o600 });
    await rename(temporary, this.path);
    return defaults;
  }
}
