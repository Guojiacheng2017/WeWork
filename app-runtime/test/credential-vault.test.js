import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialVault } from '../src/host/credential-vault.js';
import { LinuxSecretServiceVault } from '../src/host/linux-secret-service.js';
import { MacKeychainVault } from '../src/host/keychain.js';
import { WindowsDpapiVault } from '../src/host/windows-dpapi.js';

test('credential vault selects Secret Service on Linux', () => {
  assert.ok(createCredentialVault('linux') instanceof LinuxSecretServiceVault);
});

test('credential vault keeps macOS Keychain on Darwin', () => {
  assert.ok(createCredentialVault('darwin') instanceof MacKeychainVault);
});

test('credential vault selects DPAPI on Windows', () => {
  assert.ok(createCredentialVault('win32') instanceof WindowsDpapiVault);
});
