import { LinuxSecretServiceVault } from './linux-secret-service.js';
import { MacKeychainVault } from './keychain.js';
import { WindowsDpapiVault } from './windows-dpapi.js';

export function createCredentialVault(platform, options = {}) {
  if (platform === 'linux') return new LinuxSecretServiceVault(options);
  if (platform === 'darwin') return new MacKeychainVault(options);
  if (platform === 'win32') return new WindowsDpapiVault(options);
  throw new Error(`Unsupported credential vault platform: ${platform}`);
}
