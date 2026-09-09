import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialVault } from '../src/host/credential-vault.js';
import { LinuxSecretServiceVault } from '../src/host/linux-secret-service.js';
import { MacKeychainVault } from '../src/host/keychain.js';

test('credential vault selects Secret Service on Linux', () => {
  assert.ok(createCredentialVault('linux') instanceof LinuxSecretServiceVault);
});

test('credential vault keeps macOS Keychain on Darwin', () => {
  assert.ok(createCredentialVault('darwin') instanceof MacKeychainVault);
});

test('credential vault rejects unsupported desktop platforms', () => {
  assert.throws(() => createCredentialVault('win32'), /Unsupported credential vault platform/);
});
