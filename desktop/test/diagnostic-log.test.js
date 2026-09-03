import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticLog } from '../src/diagnostic-log.js';

test('diagnostic log is bounded and removes secret-shaped details', () => {
  const log = new DiagnosticLog(2);
  log.add('info', 'bridge', 'one', { durationMs: 3, authorization: 'Bearer secret' });
  log.add('error', 'runtime', 'two', { apiKey: 'secret', code: 'FAILED' });
  log.add('info', 'host', 'three');
  const result = log.snapshot({ host: 'ready', pid: 42 });
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0].details, { code: 'FAILED' });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
