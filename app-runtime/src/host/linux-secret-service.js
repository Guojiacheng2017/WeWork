import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execProcess } from './process.js';

export class LinuxSecretServiceVault {
  constructor(ports = {}) {
    this.exec = ports.exec ?? execProcess;
    this.metadata = new Map();
    this.service = ports.service ?? 'app.wework';
    this.metadataPath = ports.metadataPath;
  }

  async load() {
    if (!this.metadataPath || this.metadata.size) return;
    try {
      for (const item of JSON.parse(await readFile(this.metadataPath, 'utf8'))) this.metadata.set(item.ref, item);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async save() {
    if (!this.metadataPath) return;
    await mkdir(dirname(this.metadataPath), { recursive: true, mode: 0o700 });
    await writeFile(this.metadataPath, JSON.stringify([...this.metadata.values()]), { mode: 0o600 });
  }

  async run(args, options) {
    try {
      return await this.exec('secret-tool', args, options);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw Object.assign(new Error('系统未安装 secret-tool；请安装 libsecret-tools 后重试。'), { code: 'CREDENTIAL_STORE_UNAVAILABLE' });
      }
      throw error;
    }
  }

  async createCredential({ label, kind, secret }) {
    if (typeof secret !== 'string' || !secret.length) throw new Error('Credential must not be empty');
    await this.load();
    const ref = `keychain:${randomUUID()}`;
    const account = ref.slice('keychain:'.length);
    try {
      await this.run(['store', `--label=${label}`, 'service', this.service, 'account', account], { input: secret });
      if (await this.resolveCredential(ref) !== secret) throw new Error('Credential verification failed');
      this.metadata.set(ref, { ref, label, kind });
      await this.save();
      return { ref };
    } catch (error) {
      await this.run(['clear', 'service', this.service, 'account', account]).catch(() => {});
      if (error.code === 'CREDENTIAL_STORE_UNAVAILABLE') throw error;
      throw Object.assign(new Error('无法保存到系统密钥环，请确认桌面 Secret Service 已启动。'), { code: 'CREDENTIAL_STORE_FAILED' });
    }
  }

  async listCredentials() {
    await this.load();
    return [...this.metadata.values()].map(({ ref, label, kind }) => ({ ref, label, kind }));
  }

  async resolveCredential(ref) {
    const account = ref.replace(/^keychain:/, '');
    const { stdout } = await this.run(['lookup', 'service', this.service, 'account', account]);
    return stdout.replace(/\r?\n$/, '');
  }
}
