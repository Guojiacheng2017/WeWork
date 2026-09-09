import { LinuxSecretServiceVault } from './linux-secret-service.js';
import { MacKeychainVault } from './keychain.js';

export function createCredentialVault(platform, options = {}) {
  if (platform === 'linux') return new LinuxSecretServiceVault(options);
  if (platform === 'darwin') return new MacKeychainVault(options);
  throw new Error(`Unsupported credential vault platform: ${platform}`);
}
