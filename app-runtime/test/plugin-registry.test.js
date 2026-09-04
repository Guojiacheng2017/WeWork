import test from 'node:test'; import assert from 'node:assert/strict'; import { resolve } from 'node:path';
import { PluginRegistry } from '../src/host/plugin-registry.js';

test('registry discovers Codex-compatible plugin manifests and enforces team enablement', async () => {
  const team={id:'t1',modules:{plugins:{}}};
  const registry=new PluginRegistry({roots:[resolve(import.meta.dirname,'../../plugins')],wework:{api:{snapshot:async()=>({teams:[team]})}},vault:{listCredentials:async()=>[],resolveCredential:async()=>assert.fail()}});
  const catalog=await registry.discover(); assert.equal(catalog[0].name,'wework-plane'); assert.equal(catalog[0].mcpServers,'./.mcp.json');
  await assert.rejects(registry.invoke({teamId:'t1',pluginName:'wework-plane',tool:'project_sync'}),error=>error.code==='PLUGIN_DISABLED');
});
