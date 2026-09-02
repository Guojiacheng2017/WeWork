import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { discoverPiModels } from '../src/host/pi-model-discovery.js';

test('Pi catalog is discovered from its RPC state without exposing connection settings', async () => {
  let spawned;
  const spawnProcess = (_file, args, options) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null; child.killed = false;
    child.kill = () => { child.killed = true; child.exitCode = 0; queueMicrotask(() => child.emit('close', 0)); };
    child.stdin.on('data', (chunk) => {
      const request = JSON.parse(chunk.toString());
      const data = request.type === 'get_state' ? { model: { provider: 'anthropic', id: 'claude-sonnet' } } : { models: [{ provider: 'anthropic', id: 'claude-sonnet', name: 'Claude Sonnet', baseUrl: 'must-not-leak' }, { provider: 'openai', id: 'gpt-5', name: 'GPT-5' }] };
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, type: 'response', success: true, data })}\n`));
    });
    spawned = { args, options, child }; return child;
  };
  const result = await discoverPiModels('/usr/local/bin/pi', { spawnProcess, environment: { WEWORK_HOST_TOKEN: 'bearer', WEWORK_HOST_PORT: '8790', PATH: '/bin' } });
  assert.ok(spawned.args.includes('--mode') && spawned.args.includes('rpc'));
  assert.equal(result.models.length, 2);
  assert.equal(result.models[0].isDefault, true);
  assert.equal(result.defaults.pi, result.models[0].id);
  assert.equal('baseUrl' in result.models[0], false);
  assert.equal('credentialRef' in result.models[0], false);
  assert.deepEqual(spawned.options.env, { PATH: '/bin' });
});
