import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execProcess } from './process.js';

const protectScript = [
  'Add-Type -AssemblyName System.Security',
  '$plain = [Console]::In.ReadToEnd()',
  '$bytes = [Text.Encoding]::UTF8.GetBytes($plain)',
  '$cipher = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Convert]::ToBase64String($cipher))',
].join('; ');

const unprotectScript = [
  'Add-Type -AssemblyName System.Security',
  '$cipher = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
  '$bytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
  '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))',
].join('; ');

export class WindowsDpapiVault {
  constructor(ports = {}) {
    this.exec = ports.exec ?? execProcess;
    this.metadata = new Map();
    this.metadataPath = ports.metadataPath;
    this.secretsDirectory = ports.secretsDirectory ?? (this.metadataPath ? join(dirname(this.metadataPath), 'credential-secrets') : undefined);
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

  async powershell(script, input) {
    try {
      return await this.exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { input });
    } catch (error) {
      throw Object.assign(new Error('Windows DPAPI 密钥存储不可用。'), { code: 'CREDENTIAL_STORE_UNAVAILABLE', cause: error });
    }
  }

  secretPath(ref) {
    if (!this.secretsDirectory) throw new Error('Windows credential storage directory is not configured');
    return join(this.secretsDirectory, `${ref.replace(/^keychain:/, '')}.dpapi`);
  }

  async createCredential({ label, kind, secret }) {
    if (typeof secret !== 'string' || !secret.length) throw new Error('Credential must not be empty');
    await this.load();
    const ref = `keychain:${randomUUID()}`;
    const path = this.secretPath(ref);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const { stdout } = await this.powershell(protectScript, secret);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(temporary, stdout.trim(), { mode: 0o600 });
      await rename(temporary, path);
      if (await this.resolveCredential(ref) !== secret) throw new Error('Credential verification failed');
      this.metadata.set(ref, { ref, label, kind });
      await this.save();
      return { ref };
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      await rm(path, { force: true }).catch(() => {});
      if (error.code === 'CREDENTIAL_STORE_UNAVAILABLE') throw error;
      throw Object.assign(new Error('无法使用 Windows DPAPI 保存密钥。'), { code: 'CREDENTIAL_STORE_FAILED' });
    }
  }

  async listCredentials() {
    await this.load();
    return [...this.metadata.values()].map(({ ref, label, kind }) => ({ ref, label, kind }));
  }

  async resolveCredential(ref) {
    const ciphertext = await readFile(this.secretPath(ref), 'utf8');
    const { stdout } = await this.powershell(unprotectScript, ciphertext);
    return stdout;
  }
}
