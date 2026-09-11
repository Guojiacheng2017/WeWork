import test from 'node:test';
import assert from 'node:assert/strict';
import { windowsCommandInvocation } from '../src/windows-command.js';

test('Windows command shim runs cmd files through the bundled PowerShell relay', () => {
  assert.deepEqual(
    windowsCommandInvocation('C:\\Users\\worker\\AppData\\Roaming\\npm\\pi.cmd', ['--version'], 'C:\\Program Files\\WeWork\\pi-command-wrapper.ps1'),
    {
      file: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Program Files\\WeWork\\pi-command-wrapper.ps1', 'C:\\Users\\worker\\AppData\\Roaming\\npm\\pi.cmd', '--version'],
    },
  );
});

test('Windows command shim leaves native executables unchanged', () => {
  assert.deepEqual(windowsCommandInvocation('C:\\Tools\\pi.exe', ['--version'], 'C:\\wrapper.ps1'), { file: 'C:\\Tools\\pi.exe', args: ['--version'] });
});
