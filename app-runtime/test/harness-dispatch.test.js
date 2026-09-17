import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHarness } from '../src/harness-dispatch.js';
test('unverified external adapters never silently fall back to bundled Pi SDK',async()=>{
  for(const adapter of ['claude-code','codex-cli','gemini-cli','smalldash','unknown']) {
    await assert.rejects(executeHarness({runtimeProfile:{adapter,enabled:true}},{}),{code:'HARNESS_ADAPTER_UNAVAILABLE'});
  }
});
