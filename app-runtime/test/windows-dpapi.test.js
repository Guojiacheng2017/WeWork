import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WindowsDpapiVault } from '../src/host/windows-dpapi.js';

test('Windows vault persists only DPAPI ciphertext and resolves the original credential', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-windows-vault-'));
  const calls = [];
  const exec = async (file, args, options = {}) => {
    calls.push({ file, args, input: options.input });
    assert.equal(file, 'powershell.exe');
    return args.some((value) => value.includes('ProtectedData]::Protect(')) ? { stdout: 'ZW5jcnlwdGVk\n' } : { stdout: 'sk-windows-secret' };
  };
  const vault = new WindowsDpapiVault({ exec, metadataPath: join(root, 'credentials.json'), secretsDirectory: join(root, 'secrets') });

  const { ref } = await vault.createCredential({ label: 'Windows 模型密钥', kind: 'model-api-key', secret: 'sk-windows-secret' });

  assert.equal(await vault.resolveCredential(ref), 'sk-windows-secret');
  assert.deepEqual(await vault.listCredentials(), [{ ref, label: 'Windows 模型密钥', kind: 'model-api-key' }]);
  assert.doesNotMatch(await readFile(join(root, 'credentials.json'), 'utf8'), /sk-windows-secret/);
  assert.equal(await readFile(join(root, 'secrets', `${ref.slice(9)}.dpapi`), 'utf8'), 'ZW5jcnlwdGVk');
  assert.ok(calls.every(({ args }) => !args.some((value) => value.includes('sk-windows-secret'))));
});
