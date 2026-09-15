import { checkProductionAdmission } from './host/production-admission.js';
import { executePiCommand } from './pi-command.js';
import { WeWorkService } from './host/wework-service.js';
import { TeamPartitionedWeWorkStorage, safeTeamDirectory } from './host/team-partitioned-wework-storage.js';
import { createWeWorkTools } from './wework-tools.js';
import { WorkflowSupervisor } from './host/workflow-supervisor.js';
import { CollaborationCoordinator } from './host/collaboration-coordinator.js';
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { CheckpointStore } from "./host/checkpoint-store.js";
import { MacDirectoryService } from "./host/directory.js";
import { createCredentialVault } from './host/credential-vault.js';
import { RuntimeManager } from "./host/runtime-manager.js";
import { withVaultCredential } from "./host/runtime-execute.js";
import { createHostServer, EventJournal } from "./host/server.js";
import { createSshWorkspaceProbe, OpenSshService } from "./host/ssh.js";
import { HarnessDetector } from "./host/harness-detector.js";
import { HarnessPolicyStore } from "./host/harness-policy.js";
import { executeHarness } from "./harness-dispatch.js";
import { RemoteSdhClient, SdhConnectionStore, remoteSdhCapabilities } from './host/sdh-connection.js';
import { discoverAvailableSkills } from './skill-loader.js';
import { WeWorkWorkspaceLayout } from './host/wework-workspace-layout.js';
import { resolveWeWorkConfiguration } from './host/wework-configuration.js';
import { listAvailableHarnessModels, mapSdhModel } from './host/available-harness-models.js';
import { PluginRegistry } from './host/plugin-registry.js';
import { HarnessModelDefaultStore } from './host/harness-model-defaults.js';

const weworkRoot = process.env.WEWORK_APP_DATA_DIR ?? join(homedir(), 'Documents', 'WeWork');
const configRoot = process.env.WEWORK_CONFIG_DIR ?? join(homedir(), 'Documents', '.wework');
const legacyDataRoot = join(homedir(), '.wework');
const runtimeDataRoot = join(configRoot, 'runtime-data');
const token = process.env.WEWORK_HOST_TOKEN ?? randomBytes(32).toString("hex");
const port = Number(process.env.WEWORK_HOST_PORT ?? 0);
const directory = new MacDirectoryService({ configPath: join(configRoot, 'current-workspace.json') });
const vault = createCredentialVault(process.platform, { metadataPath: join(configRoot, 'credentials.json') });
const ssh = new OpenSshService();
const bundledSkillRoots = process.env.WEWORK_SKILLS_DIR
  ? [{ root: process.env.WEWORK_SKILLS_DIR, source: 'wework' }]
  : process.argv[1].endsWith('.cjs')
    ? [{ root: join(dirname(process.argv[1]), 'skills', 'wework'), source: 'wework' }]
    : [{ root: resolve(dirname(process.argv[1]), '../skills'), source: 'wework' }];
const weworkSkillRoots = bundledSkillRoots.filter(({ source }) => source === 'wework');
const installedPluginRoot = join(configRoot, 'plugins');
const bundledPluginRoot = process.env.WEWORK_PLUGINS_DIR ?? (process.argv[1].endsWith('.cjs') ? join(dirname(process.argv[1]), 'plugins') : resolve(dirname(process.argv[1]), '../../plugins'));
const pluginRoots = [installedPluginRoot, bundledPluginRoot];
const piExtensionPath = process.env.WEWORK_PI_EXTENSION_PATH ?? join(dirname(process.argv[1]), 'pi-wework-extension.mjs');
const windowsCommandWrapperPath = process.env.WEWORK_WINDOWS_COMMAND_WRAPPER_PATH ?? join(dirname(process.argv[1]), 'pi-command-wrapper.ps1');
const harnesses = new HarnessDetector({ windowsCommandWrapperPath });
const sdhConnection = new SdhConnectionStore(join(configRoot, 'smalldashharness.json'));
const sdh = new RemoteSdhClient({ connection: sdhConnection });
const harnessPolicy = new HarnessPolicyStore(join(configRoot, "harness-policy.json"));
const harnessModelDefaults = new HarnessModelDefaultStore(join(configRoot, 'harness-model-defaults.json'));
const journal = new EventJournal();
const workspaceLayout = new WeWorkWorkspaceLayout({ weworkRoot, configRoot });
const wework = new WeWorkService(new TeamPartitionedWeWorkStorage(weworkRoot, {
  legacyPath: join(legacyDataRoot, 'wework.json'), indexPath: join(configRoot, 'wework-index.json'),
  teamPath: (teamId, file) => join(workspaceLayout.paths(teamId).state, file),
  legacySources: [
    { indexPath: join(weworkRoot, 'wework-index.json'), legacyPath: join(weworkRoot, 'wework.json'), teamPath: (teamId, file) => join(weworkRoot, 'teams', safeTeamDirectory(teamId), file) },
    { indexPath: join(legacyDataRoot, 'wework-index.json'), legacyPath: join(legacyDataRoot, 'wework.json'), teamPath: (teamId, file) => join(legacyDataRoot, 'teams', safeTeamDirectory(teamId), file) },
  ],
}), { workspaceLayout, configRoot, configurationResolver: resolveWeWorkConfiguration,
  nativePiCommand: async (spec, command) => { if (!(await harnessPolicy.get()).allowedHarnesses.includes('pi')) throw new Error('此设备未允许 Pi'); return executePiCommand(spec, command); },
  currentWorkspace: () => directory.currentDirectory(), listCredentials: () => vault.listCredentials() });
const runtime = new RuntimeManager({
  store: new CheckpointStore(join(configRoot, "runtime")), journal,
  execute: withVaultCredential(vault, async (spec, options) => {
    const harnessId=spec.runtimeProfile.adapter==='smalldash'?'smalldashharness':spec.runtimeProfile.adapter;
    if(!(await harnessPolicy.get()).allowedHarnesses.includes(harnessId)) throw new Error('Harness is not allowed on this device');
    return executeHarness(spec,{...options,checkNativeTool:(name)=>checkProductionAdmission(wework,spec,name),dataRoot:runtimeDataRoot,legacyDataRoots:[weworkRoot,legacyDataRoot],migrationQuarantineRoot:join(configRoot,'migration-quarantine'),sdh,bundledSkillRoots:weworkSkillRoots,extensionPath:piExtensionPath,windowsCommandWrapperPath,tools:spec.wework?createWeWorkTools(wework,spec,options.signal):[]});
  }),
  onEvents: (spec, events) => spec.wework ? wework.recordEvents(spec, events) : undefined,
  onFinish: (spec, result, error) => spec.wework ? wework.finish(spec, result, error) : undefined,
});
wework.isEmployeeActive = (employeeId) => [...runtime.active.values()].some((run) => run.employeeId === employeeId);
const coordinator = new CollaborationCoordinator({wework,runtime});
wework.attachCoordinator(coordinator);
const workflows = new WorkflowSupervisor({wework, runtime, path: join(configRoot, 'workflow-executions.json')});
wework.workflowSupervisor = workflows;
const listHarnessModels = async () => {
  const catalog = await listAvailableHarnessModels({ detector: harnesses, sdh });
  const preferred = await harnessModelDefaults.get();
  const defaults = { ...catalog.defaults, ...preferred };
  return { models: catalog.models.map((model) => ({ ...model, isDefault: defaults[model.harness] === model.id })), defaults };
};
const probeHarnessModel = async (input) => {
  if(input?.harness!=='smalldashharness') return {ok:false,error:'当前版本仅适配 smalldashharness'};
  const result=await sdh.probeModel({baseUrl:input.baseUrl,modelId:input.modelId});
  return {ok:Boolean(result.reachable&&result.chatCompletionsSupported),modelIds:result.discoveredModels,error:result.error?.message};
};
const saveHarnessModel = async (input) => {
  if(input?.harness!=='smalldashharness') throw Object.assign(new Error('当前版本仅适配 smalldashharness'),{code:'MODEL_CONFIG_INVALID'});
  const saved=await sdh.saveModel({name:input.name,provider:'openai-compatible',modelId:input.modelId,baseUrl:input.baseUrl,contextWindow:input.contextWindow,maxTokens:input.maxTokens,authentication:'none'});
  return mapSdhModel(saved.model??saved);
};
const plugins = new PluginRegistry({ vault, wework, roots: pluginRoots, installRoot: installedPluginRoot, statePath: join(configRoot, 'plugin-policy.json') });
const services = {
  weworkCall: (method, args) => wework.call(method, args),
  dataInfo: () => ({ rootPath: weworkRoot, configPath: configRoot, teamsPath: weworkRoot, runtimePath: join(configRoot, 'runtime'), platform: process.platform }),
  listHarnesses: async () => {
    const rows=await harnesses.detect(); const connection=await sdhConnection.get();
    let reachable=false,version,health,reason=connection.configured?'远程服务不可达':'尚未配置远程服务地址';
    if(connection.configured) try { health=await sdh.health(); reachable=health.ok===true&&health.service==='smalldashharness'; version=health.version; reason=reachable?'已连接远程服务':'服务响应不兼容'; } catch(error) { reason=error.message; }
    const capabilities=remoteSdhCapabilities(health,reachable);
    return rows.map(row=>row.harness==='smalldashharness'?{...row,kind:'local-service',available:connection.configured,executionReady:reachable,weworkToolsReady:capabilities.tools,version,reason,capabilities,configuration:{source:'service'}}:row);
  },
  getSdhConnection: async () => { const value=await sdhConnection.get(); if(!value.configured)return value; try { const health=await sdh.health(); if(health.service!=='smalldashharness')throw new Error('目标不是 smalldashharness 服务'); await sdh.models(); return {...value,reachable:true,service:health.service}; } catch(error) { return {...value,reachable:false,error:error.message}; } },
  setSdhConnection: async (input) => { const value=await sdhConnection.set(input); const health=await sdh.health(); if(health.service!=='smalldashharness')throw Object.assign(new Error('目标不是 smalldashharness 服务'),{code:'HARNESS_PROTOCOL_UNSUPPORTED'}); await sdh.models(); return {...value,reachable:true,service:health.service}; },
  getHarnessPolicy: () => harnessPolicy.get(), setHarnessPolicy: (input) => harnessPolicy.set(input.allowedHarnesses ?? []),
  listHarnessModels, saveHarnessModel, setDefaultHarnessModel: async (harness, modelId) => {
    const catalog = await listHarnessModels();
    if (!catalog.models.some((model) => model.harness === harness && model.id === modelId)) throw Object.assign(new Error('模型不属于该 Harness'), { code: 'MODEL_CONFIG_INVALID' });
    if (harness === 'smalldashharness') await sdh.setDefaultModel(modelId);
    else if (harness === 'pi') await harnessModelDefaults.set(harness, modelId);
    else throw Object.assign(new Error('当前 Harness 尚不支持模型选择'), { code: 'MODEL_CONFIG_INVALID' });
    return listHarnessModels();
  },
  probeHarnessModel,
  listSkills: async (request = {}) => {
    const { workspace, skillRoots } = await wework.resolveSkillCatalog(request);
    if (workspace?.kind === 'ssh') return { skills: [], reason: '远程 Workspace Skill 发现尚未接入' };
    return { skills: await discoverAvailableSkills({ workspaceRoot: workspace.rootPath, skillRoots, bundledRoots: weworkSkillRoots }) };
  },
  currentDirectory: () => directory.currentDirectory(), chooseDirectory: () => directory.chooseDirectory(),
  createCredential: (input) => vault.createCredential(input), listCredentials: () => vault.listCredentials(),
  listPlugins: () => plugins.discover(), setPluginEnabled: (input) => plugins.setEnabled(input.name,input.enabled), installPlugin: (input) => plugins.install(input.path), invokePlugin: (input) => plugins.invoke(input),
  probeSshWorkspace: createSshWorkspaceProbe({ vault, ssh }),
  runtime: { steerEmployee: (id,message) => runtime.steerEmployee(id,message), start: async (spec) => spec.weworkManaged ? wework.startRun(spec,runtime) : wework.startExternalRun(spec,runtime), get: (id) => runtime.get(id), cancel: (id) => runtime.cancelAndWait(id) },
};
const host = createHostServer({ token, services, journal });
wework.reconcileWorkspaces().then(()=>coordinator.recover()).then(()=>workflows.recover()).then(()=>host.listen(port)).then(() => {
  console.log(JSON.stringify({ type: "wework-host.ready", url: host.url }));
}).catch((error) => {
  console.error(`WeWork Host failed: ${error.code ?? "HOST_START_FAILED"}`);
  process.exitCode = 1;
});
let stopping=false;
const shutdown=async()=>{
  if(stopping)return;stopping=true;
  await workflows.close();
  await coordinator.close();
  await Promise.allSettled([...runtime.active.keys()].map(id=>runtime.cancelAndWait(id)));
  process.exit(0);
};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
