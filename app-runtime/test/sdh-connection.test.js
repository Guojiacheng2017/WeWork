import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RemoteSdhClient, SdhConnectionStore } from '../src/host/sdh-connection.js';

test('persists one remote SDH service URL and probes its health endpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wework-sdh-'));
  const connection = new SdhConnectionStore(join(root, 'sdh.json'));
  assert.deepEqual(await connection.get(), { baseUrl: '', configured: false });
  await connection.set({ baseUrl: 'http://gpu.example:23334/' });
  const calls = [];
  const client = new RemoteSdhClient({ connection, fetch: async (url) => { calls.push(url); return new Response(JSON.stringify({ ok: true, service: 'smalldashharness' }), { status: 200 }); } });
  assert.equal((await client.health()).service, 'smalldashharness');
  assert.deepEqual(calls, ['http://gpu.example:23334/health']);
});

test('does not silently fall back to localhost when SDH is unconfigured', async () => {
  const connection = { get: async () => ({ baseUrl: '', configured: false }) };
  await assert.rejects(new RemoteSdhClient({ connection }).health(), /先配置远程/);
});

test('uses the model configured by the existing SDH dashboard when catalog is empty', async () => {
  const connection={get:async()=>({baseUrl:'http://gpu:23334',configured:true})};
  const client=new RemoteSdhClient({connection,fetch:async(url)=>{
    if(url.endsWith('/api/models'))return new Response(JSON.stringify({models:[],defaultId:null}));
    if(url.endsWith('/api/settings'))return new Response(JSON.stringify({settings:{QWEN_MODEL:'Qwen',QWEN_API_URL:'http://model:8000/v1'}}));
    if(url.endsWith('/health/upstream'))return new Response(JSON.stringify({model:true}));
    throw new Error(url);
  }});
  const catalog=await client.models();
  assert.equal(catalog.models[0].modelId,'Qwen');
  assert.equal(catalog.models[0].verified,true);
  assert.equal(catalog.defaultId,'sdh:configured-default');
});
