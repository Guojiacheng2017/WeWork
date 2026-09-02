import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight } from '../src/single-flight.mjs';

test('coalesces repeated requests until the active operation settles', async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const choose = singleFlight(async () => { calls += 1; await pending; return '/workspace'; });

  const first = choose();
  const second = choose();
  const third = choose();
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second, third]), ['/workspace', '/workspace', '/workspace']);

  assert.equal(await choose(), '/workspace');
  assert.equal(calls, 2);
});
