import assert from 'node:assert/strict';
import test from 'node:test';
import { HarnessDetector } from '../src/host/harness-detector.js';

test('installed Pi CLI is exposed through the verified WeWork Pi adapter', async () => {
  const detector = new HarnessDetector({ run: async (file, args) => {
    if (file === 'which' && args[0] === 'pi') return { stdout: '/opt/pi\n' };
    if (file === '/opt/pi' && args[0] === '--version') return { stdout: '0.84.3\n' };
    throw new Error('missing');
  } });
  const pi = (await detector.detect()).find(row=>row.harness==='pi');
  assert.equal(pi.harness, 'pi');
  assert.equal(pi.kind, 'executable');
  assert.equal(pi.available, true);
  assert.equal(pi.executionReady, true);
  assert.equal(pi.weworkToolsReady, true);
  assert.equal(pi.capabilities.resumeSession, true);
  assert.equal(pi.executablePath, '/opt/pi');
  assert.match(pi.reason, /Pi RPC adapter/);
});

test('macOS finds Pi in Homebrew when the desktop PATH lookup misses it', async () => {
  const calls = [];
  const detector = new HarnessDetector({
    platform: 'darwin',
    env: { PATH: '/usr/bin:/bin' },
    run: async (file, args, options) => {
      calls.push([file, args]);
      if (file === 'which' && args[0] === 'pi') throw Object.assign(new Error('pi not found'), { code: 1 });
      if (file === '/opt/homebrew/bin/pi' && args[0] === '--version') {
        assert.match(options.environment.PATH, /^\/opt\/homebrew\/bin:/);
        return { stdout: '0.84.3\n' };
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
  });

  const pi = (await detector.detect()).find((row) => row.harness === 'pi');

  assert.equal(pi.available, true);
  assert.equal(pi.executionReady, true);
  assert.equal(pi.executablePath, '/opt/homebrew/bin/pi');
  assert.ok(calls.some(([file]) => file === '/opt/homebrew/bin/pi'));
  assert.equal(pi.diagnostics.lookupError, '1: pi not found');
});

test('external CLI installation is still not confused with WeWork execution readiness', async () => {
  const detector = new HarnessDetector({run:async(file,args)=> {
    if(file==='which' && args[0]==='claude') return {stdout:'/opt/claude\n'};
    if(file==='/opt/claude') return {stdout:'claude 1.0'};
    throw new Error('missing');
  }});
  const claude=(await detector.detect()).find(row=>row.harness==='claude-code');
  assert.equal(claude.available,true);
  assert.equal(claude.weworkToolsReady,false);
  assert.equal(claude.executionReady,false);
  assert.equal(claude.capabilities.tools,false);
});

test('sdh is embedded only when its bundled runner is present', async () => {
  const detector=new HarnessDetector({run:async()=>{throw new Error('missing');},bundledSdh:async()=>true});
  const sdh=(await detector.detect()).find(row=>row.harness==='smalldashharness');
  assert.equal(sdh.kind,'embedded');
  assert.equal(sdh.available,true);
  assert.equal(sdh.weworkToolsReady,true);
});

test('detects only allow-listed executables with lookup and version probes', async () => {
  const calls = [];
  const detector = new HarnessDetector({
    platform: 'linux',
    run: async (file, args) => {
      calls.push([file, args]);
      if (file === 'which' && args[0] === 'claude') return { stdout: '/opt/bin/claude\n' };
      if (file === '/opt/bin/claude') return { stdout: '2.1.0 (Claude Code)\n' };
      throw new Error('not found');
    },
  });
  const rows = await detector.detect();
  const claude = rows.find((row) => row.harness === 'claude-code');
  assert.equal(claude.available, true);
  assert.equal(claude.executablePath, '/opt/bin/claude');
  assert.equal(claude.version, '2.1.0 (Claude Code)');
  assert.ok(calls.every(([file]) => ['which', '/opt/bin/claude'].includes(file)));
});

test('uses where.exe on Windows and reports unavailable installations', async () => {
  const calls = [];
  const detector = new HarnessDetector({ platform: 'win32', run: async (file, args) => { calls.push([file, args]); throw new Error('not found'); } });
  const rows = await detector.detect();
  assert.equal(rows.find((row) => row.harness === 'codex-cli').available, false);
  assert.ok(calls.some(([file]) => file === 'where.exe'));
});

test('Windows reports the app PATH and lookup failure when Pi is unavailable', async () => {
  const detector = new HarnessDetector({
    platform: 'win32',
    env: { PATH: 'C:\\Windows\\System32;D:\\piharness' },
    run: async (file, args) => {
      if (file === 'where.exe' && args[0] === 'pi') throw Object.assign(new Error('INFO: Could not find files'), { code: 1 });
      throw new Error('unexpected probe');
    },
  });

  const pi = (await detector.detect()).find((row) => row.harness === 'pi');

  assert.equal(pi.available, false);
  assert.match(pi.reason, /where\.exe pi.*Could not find files/);
  assert.deepEqual(pi.diagnostics, {
    lookupCommand: 'where.exe pi',
    path: 'C:\\Windows\\System32;D:\\piharness',
    candidates: [],
    attempts: [],
  });
});

test('Windows reports every failed Pi version probe', async () => {
  const detector = new HarnessDetector({
    platform: 'win32',
    windowsCommandWrapperPath: 'D:\\app\\pi-command-wrapper.ps1',
    run: async (file, args) => {
      if (file === 'where.exe' && args[0] === 'pi') return { stdout: 'D:\\piharness\\pi\r\nD:\\piharness\\pi.cmd\r\n' };
      if (file === 'D:\\piharness\\pi') throw Object.assign(new Error('not a valid Win32 application'), { code: 'EINVAL' });
      if (file === 'powershell.exe') throw Object.assign(new Error('running scripts is disabled'), { code: 'HARNESS_PROBE_FAILED' });
      throw new Error('unexpected probe');
    },
  });

  const pi = (await detector.detect()).find((row) => row.harness === 'pi');

  assert.equal(pi.available, false);
  assert.match(pi.reason, /2 个候选命令均无法运行/);
  assert.deepEqual(pi.diagnostics.candidates, ['D:\\piharness\\pi', 'D:\\piharness\\pi.cmd']);
  assert.deepEqual(pi.diagnostics.attempts, [
    { executablePath: 'D:\\piharness\\pi', error: 'EINVAL: not a valid Win32 application' },
    { executablePath: 'D:\\piharness\\pi.cmd', error: 'HARNESS_PROBE_FAILED: running scripts is disabled' },
  ]);
});

test('Windows probes an npm pi.cmd shim through the PowerShell relay', async () => {
  const calls = [];
  const detector = new HarnessDetector({
    platform: 'win32',
    windowsCommandWrapperPath: 'C:\\WeWork\\pi-command-wrapper.ps1',
    run: async (file, args) => {
      calls.push([file, args]);
      if (file === 'where.exe' && args[0] === 'pi') return { stdout: 'C:\\Users\\worker\\AppData\\Roaming\\npm\\pi.cmd\r\n' };
      if (file === 'powershell.exe') return { stdout: 'pi 0.84.3\r\n' };
      throw new Error('missing');
    },
  });

  const pi = (await detector.detect()).find((row) => row.harness === 'pi');

  assert.equal(pi.available, true);
  assert.equal(pi.executionReady, true);
  assert.ok(calls.some(([file, args]) => file === 'powershell.exe' && args.includes('C:\\Users\\worker\\AppData\\Roaming\\npm\\pi.cmd')));
});

test('Windows skips an unusable extensionless npm shim and detects the following pi.cmd', async () => {
  const detector = new HarnessDetector({
    platform: 'win32',
    windowsCommandWrapperPath: 'D:\\app\\pi-command-wrapper.ps1',
    run: async (file, args) => {
      if (file === 'where.exe' && args[0] === 'pi') return { stdout: 'D:\\piharness\\pi\r\nD:\\piharness\\pi.cmd\r\nD:\\piharness\\pi.ps1\r\n' };
      if (file === 'D:\\piharness\\pi') throw Object.assign(new Error('not a Win32 application'), { code: 'UNKNOWN' });
      if (file === 'powershell.exe' && args.includes('D:\\piharness\\pi.cmd')) return { stdout: 'pi 0.84.3\r\n' };
      throw new Error('unsupported candidate');
    },
  });

  const pi = (await detector.detect()).find((row) => row.harness === 'pi');

  assert.equal(pi.available, true);
  assert.equal(pi.executablePath, 'D:\\piharness\\pi.cmd');
});

test('reads the selected harness model from its own configuration', async () => {
  const detector = new HarnessDetector({
    platform: 'linux', home: '/home/test', env: {},
    readText: async (path) => path.endsWith('/.codex/config.toml') ? 'model_provider = "openai"\nmodel = "gpt-5.3-codex"\n' : '',
    run: async (file, args) => {
      if (file === 'which' && args[0] === 'codex') return { stdout: '/opt/bin/codex\n' };
      if (file === '/opt/bin/codex') return { stdout: 'codex-cli 1.0\n' };
      throw new Error('not found');
    },
  });
  const codex = (await detector.detect()).find((row) => row.harness === 'codex-cli');
  assert.deepEqual(codex.configuration, { source: 'harness', provider: 'openai', modelId: 'gpt-5.3-codex' });
});

test('CLI lookup and version probes never receive the Host bearer environment', async () => {
  const environments = [];
  const detector = new HarnessDetector({
    env: { WEWORK_HOST_TOKEN: 'bearer', WEWORK_HOST_PORT: '8790', PATH: '/bin' },
    run: async (file, args, options) => {
      environments.push(options.environment);
      if (file === 'which' && args[0] === 'pi') return { stdout: '/opt/pi\n' };
      if (file === '/opt/pi') return { stdout: 'pi 1.0\n' };
      throw new Error('missing');
    },
  });

  await detector.detect();
  assert.ok(environments.length >= 2);
  assert.ok(environments.every((environment) => environment.WEWORK_HOST_TOKEN === undefined && environment.WEWORK_HOST_PORT === undefined));
  assert.equal(environments[0].PATH, '/bin');
  assert.ok(environments.some((environment) => environment.PATH.startsWith('/opt:')));
});
