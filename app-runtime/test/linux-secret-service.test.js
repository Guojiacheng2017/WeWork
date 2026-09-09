import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LinuxSecretServiceVault } from '../src/host/linux-secret-service.js';

test('Linux vault stores a credential outside metadata and resolves it through Secret Service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-linux-vault-'));
  const metadataPath = join(root, 'credentials.json');
  const secrets = new Map();
  const exec = async (file, args, options = {}) => {
    assert.equal(file, 'secret-tool');
    const account = args.at(-1);
    if (args[0] === 'store') { secrets.set(account, options.input); return { stdout: '' }; }
    if (args[0] === 'lookup') return { stdout: `${secrets.get(account)}\n` };
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  const vault = new LinuxSecretServiceVault({ exec, metadataPath });

  const { ref } = await vault.createCredential({ label: '模型密钥', kind: 'model-api-key', secret: 'sk-secret' });

  assert.equal(await vault.resolveCredential(ref), 'sk-secret');
  assert.deepEqual(await vault.listCredentials(), [{ ref, label: '模型密钥', kind: 'model-api-key' }]);
  assert.doesNotMatch(await readFile(metadataPath, 'utf8'), /sk-secret/);
});

test('Linux vault reports a clear error when Secret Service is unavailable', async () => {
  const exec = async () => { throw Object.assign(new Error('spawn secret-tool ENOENT'), { code: 'ENOENT' }); };
  const vault = new LinuxSecretServiceVault({ exec });

  await assert.rejects(
    vault.createCredential({ label: 'SSH', kind: 'ssh-private-key', secret: 'private' }),
    (error) => error.code === 'CREDENTIAL_STORE_UNAVAILABLE' && /secret-tool/.test(error.message),
  );
});
