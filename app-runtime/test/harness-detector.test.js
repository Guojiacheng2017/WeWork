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
  assert.ok(environments.every((environment) => environment.PATH === '/bin' && environment.WEWORK_HOST_TOKEN === undefined && environment.WEWORK_HOST_PORT === undefined));
});
