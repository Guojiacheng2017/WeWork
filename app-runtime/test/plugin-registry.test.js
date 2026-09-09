import test from 'node:test'; import assert from 'node:assert/strict'; import { join, resolve } from 'node:path'; import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'; import { tmpdir } from 'node:os';
import { PluginRegistry } from '../src/host/plugin-registry.js';

test('registry discovers Codex-compatible plugin manifests and enforces team enablement', async () => {
  const team={id:'t1',modules:{plugins:{}}};
  const registry=new PluginRegistry({roots:[resolve(import.meta.dirname,'../../plugins')],wework:{api:{snapshot:async()=>({teams:[team]})}},vault:{listCredentials:async()=>[],resolveCredential:async()=>assert.fail()}});
  const catalog=await registry.discover(); assert.equal(catalog[0].name,'wework-plane'); assert.equal(catalog[0].mcpServers,'./.mcp.json');
  await assert.rejects(registry.invoke({teamId:'t1',pluginName:'wework-plane',tool:'project_sync'}),error=>error.code==='PLUGIN_DISABLED');
});

test('device policy persists and a selected local plugin directory is installed', async (context) => {
  const root=await mkdtemp(join(tmpdir(),'wework-plugin-'));context.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'source','sample-plugin'),installed=join(root,'installed'),statePath=join(root,'plugin-policy.json');
  await mkdir(join(source,'.wework-plugin'),{recursive:true});
  await writeFile(join(source,'.wework-plugin','plugin.json'),JSON.stringify({name:'sample-plugin',version:'1.0.0',description:'sample',mcpServers:'./.mcp.json'}));
  await writeFile(join(source,'.mcp.json'),JSON.stringify({mcpServers:{sample:{command:'node',args:['./server.mjs']}}}));
  await writeFile(join(source,'server.mjs'),'');
  const options={roots:[installed],installRoot:installed,statePath,wework:{api:{}},vault:{}};
  const registry=new PluginRegistry(options);
  const installedCatalog=await registry.install(source);assert.equal(installedCatalog[0].source,'installed');assert.equal(installedCatalog[0].enabled,true);
  const disabled=await registry.setEnabled('sample-plugin',false);assert.equal(disabled[0].enabled,false);
  const restarted=new PluginRegistry(options);assert.equal((await restarted.discover())[0].enabled,false);
  assert.equal(JSON.parse(await readFile(statePath,'utf8'))['sample-plugin'],false);
});
