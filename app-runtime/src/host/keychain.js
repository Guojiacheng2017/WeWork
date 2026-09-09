import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execProcess } from './process.js';

export class MacKeychainVault {
  constructor(ports = {}) { this.exec = ports.exec ?? execProcess; this.metadata = new Map(); this.service = ports.service ?? 'app.wework'; this.metadataPath = ports.metadataPath; }
  async load() { if (!this.metadataPath || this.metadata.size) return; try { for (const item of JSON.parse(await readFile(this.metadataPath, 'utf8'))) this.metadata.set(item.ref, item); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  async save() { if (!this.metadataPath) return; await mkdir(dirname(this.metadataPath), { recursive: true }); await writeFile(this.metadataPath, JSON.stringify([...this.metadata.values()]), { mode: 0o600 }); }
  async readPart(account) {
    const { stdout } = await this.exec('security', ['find-generic-password', '-s', this.service, '-a', account, '-w']);
    return stdout.replace(/\r?\n$/, '');
  }
  async readEncoded(account, count) {
    const parts = [];
    for (let index = 0; index < count; index++) parts.push(await this.readPart(`${account}-${index}`));
    return Buffer.from(parts.join(''), 'base64').toString('utf8');
  }
  async createCredential({ label, kind, secret }) {
    if (!/^[a-zA-Z0-9._-]+$/.test(this.service)) throw new Error('Invalid Keychain service');
    if (typeof secret !== 'string' || !secret.length) throw new Error('Credential must not be empty');
    await this.load();
    const ref = `keychain:${randomUUID()}`, account = ref.slice(9);
    // security reads password prompts from /dev/tty. Its interactive command
    // input is bounded, and -w prints non-ASCII data as hex. ASCII base64 chunks
    // preserve all bytes while keeping commands bounded and secrets off argv.
    const parts = Buffer.from(secret, 'utf8').toString('base64').match(/.{1,256}/g);
    let attempted = 0;
    try {
      for (const [index, part] of parts.entries()) {
        attempted++;
        await this.exec('security', ['-i'], { input: `add-generic-password -U -s ${this.service} -a ${account}-${index} -X ${Buffer.from(part).toString('hex')}\n` });
      }
      if (await this.readEncoded(account, parts.length) !== secret) throw new Error('Credential verification failed');
      this.metadata.set(ref, { ref, label, kind, encoding: 'base64-chunks-v1', chunks: parts.length });
      await this.save();
      return { ref };
    } catch {
      this.metadata.delete(ref);
      for (let index = 0; index < attempted; index++) await this.exec('security', ['delete-generic-password', '-s', this.service, '-a', `${account}-${index}`]).catch(() => {});
      throw Object.assign(new Error('无法保存到系统钥匙串，请检查钥匙串是否已解锁后重试。'), { code: 'CREDENTIAL_STORE_FAILED' });
    }
  }
  async listCredentials() { await this.load(); return [...this.metadata.values()].map(({ ref, label, kind }) => ({ ref, label, kind })); }
  async resolveCredential(ref) {
    await this.load();
    const account = ref.replace(/^keychain:/, '');
    const item = this.metadata.get(ref);
    if (item?.encoding === 'base64-chunks-v1') return this.readEncoded(account, item.chunks);
    return this.readPart(account);
  }
}
