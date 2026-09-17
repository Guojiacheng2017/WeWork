import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';



export class HarnessPolicyStore {
  constructor(path) { this.path = path; this.allowed = new Set(['pi']); }
  async get() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'));
      return { allowedHarnesses: [...new Set(value.allowedHarnesses)].filter((id) => this.allowed.has(id)) };
    } catch (error) { if(error.code==='ENOENT') return { allowedHarnesses: [...this.allowed] }; throw error; }
  }
  async set(ids) {
    const allowedHarnesses = [...new Set(ids)].filter((id) => this.allowed.has(id));
    const value = { allowedHarnesses };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, this.path);
    return value;
  }
}
