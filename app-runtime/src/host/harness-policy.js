import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ALLOWED_IDS = new Set(['pi', 'smalldashharness']);

export class HarnessPolicyStore {
  constructor(path) { this.path = path; }
  async get() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      return { allowedHarnesses: [...new Set(value.allowedHarnesses)].filter((id) => ALLOWED_IDS.has(id)) };
    } catch (error) { if(error.code==='ENOENT') return { allowedHarnesses: ['smalldashharness'] }; throw error; }
  }
  async set(ids) {
    const allowedHarnesses = [...new Set(ids)].filter((id) => ALLOWED_IDS.has(id));
    const value = { allowedHarnesses };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, this.path);
    return value;
  }
}
