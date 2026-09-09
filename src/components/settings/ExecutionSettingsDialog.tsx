import { Button, Input, NativeSelect } from '../ui';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cpu, Download, FolderGit2, FolderPlus, Info, KeyRound, MonitorCog, Puzzle, RefreshCw, Settings2, X } from 'lucide-react';
import { useWeWorkStore } from '../../state/weworkStore';
import { weworkHost, type CredentialMetadata, type HarnessId, type HarnessInstallation, type HarnessModel, type HarnessModelInput, type PluginManifest, type SdhConnection, type WeWorkDataInfo } from '../../runtime/weworkHost';
import { harnessCanBeAllowed, harnessNames, harnessNeedsModel, harnessNeedsServiceUrl, harnessSupportsProfiles } from '../../runtime/harnessPresentation';
import piIcon from '../../assets/harness-icons/pi.svg?no-inline';
import claudeCodeIcon from '../../assets/harness-icons/claude-code.svg?no-inline';
import codexIcon from '../../assets/harness-icons/codex.svg?no-inline';
import geminiCliIcon from '../../assets/harness-icons/gemini-cli.svg?no-inline';
import { HarnessModelCatalog } from './HarnessModelCatalog';
import { DataWorkspaceSettings } from './DataWorkspaceSettings';

const installHelp: Partial<Record<HarnessId, string>> = {
  'claude-code': '请按 Claude Code 官方文档安装并完成登录。',
  'codex-cli': '请安装 Codex CLI，并在终端完成登录。',
  'gemini-cli': '请安装 Gemini CLI，并在终端完成登录。',
  pi: '请先安装 Pi，再由 WeWork 探测本机命令。',
  smalldashharness: '填写远程 smalldashharness Docker 服务地址。',
};

const harnessIconSources: Partial<Record<HarnessId, string>> = {
  pi: piIcon,
  'claude-code': claudeCodeIcon,
  'codex-cli': codexIcon,
  'gemini-cli': geminiCliIcon,
};

type SettingsSection = 'general' | 'execution' | 'plugins' | 'storage' | 'about';

const settingsNavigation: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: '常规', icon: Settings2 },
  { id: 'execution', label: '执行器', icon: Cpu },
  { id: 'plugins', label: '插件', icon: Puzzle },
  { id: 'storage', label: '工作区与安全', icon: FolderGit2 },
  { id: 'about', label: '关于平台', icon: Info },
];

export function ExecutionSettingsDialog({ onClose, initialSection = 'general' }: { onClose: () => void; initialSection?: SettingsSection | 'workspace' }) {
  const dialogRef = useDialogFocus(true, onClose);
  const { runtimeProfiles, teams, createRuntimeProfile } = useWeWorkStore();
  const desktopHostAvailable = typeof window !== 'undefined' && Boolean(window.weworkHost);
  const [installations, setInstallations] = useState<HarnessInstallation[]>([]);
  const [allowedHarnesses, setAllowedHarnesses] = useState<HarnessId[]>([]);
  const [loadingHarnesses, setLoadingHarnesses] = useState(true);
  const [harness, setHarness] = useState<HarnessId>('smalldashharness');
  const [draft, setDraft] = useState({ name: '', provider: 'openai', modelId: '', credentialRef: '', apiKeyEnv: '', baseUrl: '', thinkingLevel: 'off' });
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [credentialDraft, setCredentialDraft] = useState({ label: '', secret: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SettingsSection>(initialSection === 'workspace' ? 'storage' : initialSection);
  const [settingsQuery, setSettingsQuery] = useState('');
  const [restoreTeams, setRestoreTeams] = useState(() => window.localStorage.getItem('wework.restoreTeams') !== 'false');
  const [dataInfo, setDataInfo] = useState<WeWorkDataInfo | null>(null);
  const [models, setModels] = useState<HarnessModel[]>([]);
  const [modelDraft, setModelDraft] = useState({ name: '', provider: 'openai-compatible', modelId: '', baseUrl: '' });
  const [sdhConnection, setSdhConnection] = useState<SdhConnection>({ baseUrl: '', configured: false });
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);

  const togglePlugin = async (plugin: PluginManifest) => {
    setPluginBusy(plugin.name); setMessage('');
    try { setPlugins(await weworkHost.setPluginEnabled(plugin.name,!plugin.enabled)); }
    catch(error){ setMessage(error instanceof Error?error.message:String(error)); }
    finally { setPluginBusy(null); }
  };
  const installPlugin = async () => {
    setPluginBusy('install'); setMessage('');
    try { const result=await weworkHost.installPlugin(); if(result){setPlugins(result);setMessage('插件已安装并启用');} }
    catch(error){ setMessage(error instanceof Error?error.message:String(error)); }
    finally { setPluginBusy(null); }
  };

  const selectedInstallation = useMemo(() => {
    const found = installations.find((item) => item.harness === harness);
    return {
      ...(found ?? { id: `missing:${harness}`, harness, kind: 'executable' as const, available: false, executionReady: false,
        capabilities: { streaming: false, resumeSession: false, cancellation: false, workspace: false, tools: false } }),
      configuration: found?.configuration ?? { source: 'harness' as const },
    };
  }, [installations, harness]);
  const configurableInstallations = useMemo(
    () => installations.filter((item) => item.executionReady && allowedHarnesses.includes(item.harness)),
    [allowedHarnesses, installations],
  );
  const displayedInstallations = useMemo(() => {
    const available = installations.filter((item) => item.available);
    if (available.some((item) => item.harness === 'smalldashharness')) return available;
    return [{
      id: 'remote:smalldashharness', harness: 'smalldashharness' as const, kind: 'local-service' as const,
      available: false, executionReady: false,
      capabilities: { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
      configuration: { source: 'harness' as const },
    }, ...available];
  }, [installations]);
  const needsModel = harnessNeedsModel(harness);
  const needsServiceUrl = harnessNeedsServiceUrl(harness);

  useEffect(() => {
    if (!selectedInstallation) return;
    const detected = selectedInstallation.configuration;
    setDraft((current) => ({
      ...current,
      name: `${harnessNames[harness]}${detected?.modelId ? ` · ${detected.modelId}` : ''}`,
      provider: detected?.provider ?? (harness === 'smalldashharness' ? 'openai-compatible' : ''),
      modelId: detected?.modelId ?? '',
    }));
  }, [harness, selectedInstallation]);

  const refreshHarnesses = async () => {
    setLoadingHarnesses(true);
    try {
      const [found, policy, vault, catalog, connection] = await Promise.all([weworkHost.harnesses(), weworkHost.harnessPolicy(), weworkHost.credentials().catch(() => []), weworkHost.harnessModels().catch(() => ({ models: [], defaults: {} })), weworkHost.sdhConnection().catch(() => ({ baseUrl: '', configured: false }))]);
      setInstallations(found);
      setAllowedHarnesses(policy.allowedHarnesses);
      setCredentials(vault.filter((item) => item.kind === 'model-api-key'));
      setModels(catalog.models);
      setSdhConnection(connection);
      const ready = found.find((item) => item.executionReady && policy.allowedHarnesses.includes(item.harness));
      setHarness((current) => found.some((item) => item.harness === current && item.executionReady && policy.allowedHarnesses.includes(current)) ? current : ready?.harness ?? 'smalldashharness');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingHarnesses(false);
    }
  };

  const saveAvailableModel = async () => {
    const input: HarnessModelInput = { harness: 'smalldashharness', ...modelDraft, api: 'openai-completions', verified: false };
    setSaving(true);
    try {
      const savedModel = await weworkHost.saveHarnessModel(input);
      setModels((await weworkHost.harnessModels()).models);
      setModelDraft((current) => ({ ...current, name: '', modelId: '' }));
      setMessage(savedModel.verified ? '模型已保存，连接检查通过' : '模型配置已保存；端点当前未验证，可稍后直接使用或重新检查');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };

  const chooseDefaultModel = async (model: HarnessModel) => {
    setModels((await weworkHost.setDefaultHarnessModel(model.harness, model.id)).models);
    setMessage('默认模型已更新');
  };

  useEffect(() => { void refreshHarnesses(); }, []);

  useEffect(() => {
    if (!desktopHostAvailable) return;
    void weworkHost.dataInfo().then(setDataInfo).catch(() => setDataInfo(null));
    void weworkHost.plugins().then(setPlugins).catch(() => setPlugins([]));
  }, [desktopHostAvailable]);

  const profileUsage = (profileId: string) => teams.flatMap((team) => team.employees).filter((employee) => employee.defaultRuntimeProfileId === profileId).length;

  const createModelCredential = async () => {
    try {
      const ref = await weworkHost.createCredential({ label: credentialDraft.label.trim(), kind: 'model-api-key', secret: credentialDraft.secret });
      setCredentials(await weworkHost.credentials().then((items) => items.filter((item) => item.kind === 'model-api-key')));
      setDraft((current) => ({ ...current, credentialRef: ref, apiKeyEnv: '' }));
      setCredentialDraft({ label: '', secret: '' }); setMessage('模型密钥已保存到本地安全存储');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const toggleAllowed = async (installation: HarnessInstallation) => {
    if (!harnessCanBeAllowed(installation, desktopHostAvailable)) return;
    try {
      const next = allowedHarnesses.includes(installation.harness) ? allowedHarnesses.filter((id) => id !== installation.harness) : [...allowedHarnesses, installation.harness];
      const saved = await weworkHost.setHarnessPolicy(next);
      setAllowedHarnesses(saved.allowedHarnesses);
      if (!saved.allowedHarnesses.includes(harness)) {
        setHarness(installations.find((item) => item.executionReady && saved.allowedHarnesses.includes(item.harness))?.harness ?? 'smalldashharness');
      }
      setMessage('本机 Harness 使用范围已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const valid = Boolean(draft.name.trim() && selectedInstallation?.executionReady && allowedHarnesses.includes(harness) && harnessSupportsProfiles(harness)
    && draft.provider.trim() && draft.modelId.trim() && draft.baseUrl.trim() && !(draft.credentialRef && draft.apiKeyEnv.trim()));

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await createRuntimeProfile({
        name: draft.name.trim(), adapter: harness === 'smalldashharness' ? 'smalldash' : harness,
        model: needsModel
          ? { provider: draft.provider.trim(), modelId: draft.modelId.trim(), api:'openai-completions', credentialRef: draft.credentialRef || undefined, apiKeyEnv: draft.apiKeyEnv.trim() || undefined, baseUrl: draft.baseUrl.trim() || undefined }
          : { provider: 'self-managed', modelId: harness, baseUrl: draft.baseUrl.trim() },
        systemPrompt: '', thinkingLevel: draft.thinkingLevel as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh', enabled: true,
      });
      setMessage('执行配置已落盘，可在创建或配置助手时绑定');
      setDraft((current) => ({ ...current, name: '' }));
    } finally { setSaving(false); }
  };

  return <div className="ww-dialog-backdrop fixed inset-0 z-[100] grid place-items-center bg-slate-900/20 p-2 sm:p-8 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="WeWork设置" className="flex h-[min(760px,calc(100vh-64px))] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-6"><div><h3 className="text-base font-bold text-slate-900">设置</h3><p className="mt-0.5 text-[11px] text-slate-400">配置这台设备上的WeWork</p></div><Button variant="ghost" type="button" aria-label="关闭设置" onClick={onClose} className="grid h-8 w-8 place-items-center transition-colors"><X className="h-4 w-4" /></Button></header>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside className="w-full max-h-52 overflow-y-auto sm:max-h-none sm:w-56 shrink-0 border-r border-slate-100 bg-slate-50/60 p-4">
          <label className="mb-4 block"><span className="sr-only">搜索设置</span><Input type="search" value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="搜索设置" className="w-full px-3 py-2 outline-none transition-shadow" /></label>
          <p className="mb-2 px-2 text-[11px] font-bold tracking-wider text-slate-400">工作平台</p>
          {settingsNavigation.every((item) => !item.label.toLowerCase().includes(settingsQuery.trim().toLowerCase())) && <p role="status" className="px-2 text-xs text-slate-500">没有匹配的设置，请尝试其他关键词。</p>}
          <nav aria-label="设置分类" className="space-y-1">{settingsNavigation.filter((item) => item.label.toLowerCase().includes(settingsQuery.trim().toLowerCase())).map((item) => { const Icon = item.icon; const active = section === item.id; return <Button key={item.id} type="button" aria-current={active ? "page" : undefined} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${active ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" /><span>{item.label}</span></Button>; })}</nav>
          <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2 px-2 text-[11px] text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />本地模式</div></div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {section === 'storage' && <DataWorkspaceSettings dataInfo={dataInfo} />}
          {section === 'plugins' && <div className="space-y-5 p-7"><div className="flex items-start justify-between gap-5"><div><h3 className="text-lg font-bold text-slate-900">插件</h3><p className="mt-1 text-xs text-slate-400">管理这台设备可供团队启用的 WeWork Plugin。具体使用范围仍在团队设置中决定。</p></div><Button variant="primary" type="button" disabled={!desktopHostAvailable||pluginBusy!==null} onClick={()=>void installPlugin()} className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs"><FolderPlus className="h-4 w-4"/>安装插件</Button></div>{message&&<p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{message}</p>}<div className="space-y-3">{plugins.length ? plugins.map((plugin)=><article key={plugin.name} className={`rounded-xl border p-5 transition-colors ${plugin.enabled?'border-sky-200 bg-sky-50/30':'border-slate-200 bg-white'}`}><div className="flex items-start gap-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${plugin.enabled?'bg-sky-100 text-sky-700':'bg-slate-100 text-slate-400'}`}><Puzzle className="h-5 w-5"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{plugin.interface?.displayName??plugin.name}</strong><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">v{plugin.version}</span><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${plugin.source==='bundled'?'bg-violet-50 text-violet-700':'bg-cyan-50 text-cyan-700'}`}>{plugin.source==='bundled'?'内置':'本地安装'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{plugin.interface?.shortDescription??plugin.description}</p><p className="mt-2 font-mono text-[11px] text-slate-400">{plugin.name} · .wework-plugin</p></div><div className="flex shrink-0 flex-col items-end gap-1.5"><button type="button" role="switch" aria-label={`${plugin.enabled?'停用':'启用'} ${plugin.interface?.displayName??plugin.name}`} aria-checked={plugin.enabled} disabled={pluginBusy!==null} onClick={()=>void togglePlugin(plugin)} className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${plugin.enabled?'bg-emerald-500':'bg-slate-300'} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${plugin.enabled?'left-6':'left-1'}`}/></button><span className={`text-[10px] font-semibold ${plugin.enabled?'text-emerald-600':'text-slate-400'}`}>{pluginBusy===plugin.name?'保存中…':plugin.enabled?'设备已启用':'设备已停用'}</span></div></div></article>) : <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">{desktopHostAvailable?'没有发现 Plugin，可从本机目录安装':'Plugin 安装与管理需要 Desktop Host'}</div>}</div></div>}
          {section === 'execution' && <div className="space-y-5 p-7">
            <div><h3 className="text-lg font-bold text-slate-900">执行器</h3><p className="mt-1 text-xs text-slate-400">这里只决定哪些 Harness 可以分配给助手，可同时开启多个；每位助手实际使用哪一个，在助手配置中选择。</p></div>
        <section aria-labelledby="local-harnesses">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h4 id="local-harnesses" className="text-sm font-bold text-slate-800">助手可选的 Harness</h4><p className="mt-1 text-[11px] text-slate-400">已开启 {allowedHarnesses.length} 个。开启表示助手配置中可选，不表示所有助手都在使用。</p></div><Button type="button" disabled={loadingHarnesses || !desktopHostAvailable} onClick={() => void refreshHarnesses()} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${loadingHarnesses ? 'animate-spin' : ''}`} />重新检测</Button></div>
          <div className="grid grid-cols-2 gap-2">{displayedInstallations.map((item) => {
            const allowed = allowedHarnesses.includes(item.harness);
            const canAllow = harnessCanBeAllowed(item, desktopHostAvailable);
            const iconSource = harnessIconSources[item.harness];
            const isSdh = item.harness === 'smalldashharness';
            return <article key={item.id} className={`rounded-xl border p-3 ${allowed && canAllow ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200'}`}><div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center">{iconSource ? <img src={iconSource} alt="" className="h-6 w-6 object-contain" /> : <Cpu className="h-6 w-6 text-slate-500" />}</span><strong className="flex-1 text-xs text-slate-800">{harnessNames[item.harness]}{isSdh ? '（远程）' : ''}</strong><span className={`text-[11px] font-semibold ${item.executionReady ? 'text-emerald-600' : 'text-slate-400'}`}>{item.executionReady ? '● 已连接' : isSdh ? '未连接' : '仅检测到安装'}</span></div>{isSdh ? <><p className="mt-2 text-[11px] text-slate-400">SDH Docker 服务地址（不是模型 Base URL）</p><div className="mt-2 flex gap-2"><Input aria-label="SDH 服务地址" value={sdhConnection.baseUrl} onChange={(event) => setSdhConnection({ baseUrl: event.target.value, configured: Boolean(event.target.value.trim()) })} placeholder="http://远程机器:23334" className="min-w-0 flex-1 px-2.5 py-2 text-[11px]" /><Button variant="primary" type="button" disabled={saving || !sdhConnection.baseUrl.trim()} onClick={async()=>{setSaving(true);try{const saved=await weworkHost.setSdhConnection(sdhConnection.baseUrl);setSdhConnection(saved);setMessage('远程 SDH 已连接');await refreshHarnesses();}catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{setSaving(false);}}} className="shrink-0 px-3 text-[11px]">连接测试</Button></div>{sdhConnection.error && <p className="mt-1 text-[11px] text-rose-500">{sdhConnection.error}</p>}</> : <><p className="mt-2 truncate text-[11px] text-slate-400">{item.kind === 'embedded' ? 'WeWork 内置' : item.executablePath ?? installHelp[item.harness]}</p>{item.version && <p className="mt-1 text-[11px] text-slate-400">{item.version}{item.reason ? ` · ${item.reason}` : ''}</p>}</>}<div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[11px] font-medium text-slate-500">{allowed && canAllow ? '助手配置中可选' : '允许助手选择'}</span><button type="button" role="switch" aria-label={`允许助手使用 ${harnessNames[item.harness]}`} aria-checked={allowed && canAllow} disabled={!canAllow} onClick={() => void toggleAllowed(item)} className={`relative h-5 w-9 rounded-full transition-colors ${allowed && canAllow ? 'bg-emerald-500' : 'bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${allowed && canAllow ? 'left-[18px]' : 'left-0.5'}`} /></button></div>{!item.executionReady && !isSdh && <p className="mt-2 text-[11px] leading-4 text-slate-400">只发现了命令，尚未完成 WeWork 执行适配，因此不能分配给助手。</p>}</article>;
          })}</div>
        </section>
        <HarnessModelCatalog models={models} draft={modelDraft} setDraft={setModelDraft} saving={saving} save={() => void saveAvailableModel()} chooseDefault={(model) => void chooseDefaultModel(model)} status={message} />

        {false && <><section aria-labelledby="harness-settings" className="rounded-xl border border-slate-200 p-4"><div className="mb-3"><h4 id="harness-settings" className="text-sm font-bold text-slate-800">新建执行配置</h4><p className="mt-1 text-[11px] text-slate-400">执行配置保存 Harness、模型和凭据引用，创建或编辑助手时再进行绑定。</p></div>{configurableInstallations.length > 0 && <label className="mb-4 block text-xs font-semibold text-slate-600">Harness<NativeSelect aria-label="执行配置 Harness" value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="mt-2 w-full px-3 py-2.5">{configurableInstallations.map((item) => <option key={item.id} value={item.harness}>{harnessNames[item.harness]}</option>)}</NativeSelect></label>}
          {!selectedInstallation?.executionReady || !allowedHarnesses.includes(harness) ? <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><Download className="mt-0.5 h-4 w-4 shrink-0" /><span>{desktopHostAvailable ? '请先在上方允许一个执行就绪的 Harness，才能创建助手执行配置。' : '浏览器模式无法探测本机 Harness，请在桌面版配置执行。'}</span></div> : <div className="grid grid-cols-2 gap-3"><label className="col-span-2 text-xs font-semibold text-slate-600">执行配置名称<Input aria-label="执行配置名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 w-full px-3 py-2.5" /></label>{needsServiceUrl && <label className="col-span-2 text-xs font-semibold text-slate-600">执行器服务地址<Input aria-label="Harness 服务地址" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="http://127.0.0.1:3001" className="mt-2 w-full px-3 py-2.5" /></label>}{!needsModel && !needsServiceUrl && <div className="col-span-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700"><p><CheckCircle2 className="mr-1 inline h-4 w-4" />使用该 CLI 自身的登录状态，不需要在 WeWork 重复填写 API Key。</p><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]"><dt className="text-emerald-700/70">模型来源</dt><dd>由 {harnessNames[harness]} 管理</dd><dt className="text-emerald-700/70">当前模型</dt><dd className="font-semibold">{selectedInstallation.configuration?.modelId ?? 'Harness 未显式指定（使用其默认模型）'}</dd>{selectedInstallation.configuration?.provider && <><dt className="text-emerald-700/70">提供方</dt><dd>{selectedInstallation.configuration.provider}</dd></>}</dl>{!harnessSupportsProfiles(harness) && <p className="mt-2 text-emerald-700/70">当前版本仅完成安全探测，执行适配器将在后续接入。</p>}</div>}<details className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">高级设置</summary><label className="mt-3 block text-xs font-semibold text-slate-600">思考级别<NativeSelect value={draft.thinkingLevel} onChange={(event) => setDraft({ ...draft, thinkingLevel: event.target.value })} className="mt-2 w-full px-3 py-2.5"><option value="off">关闭</option><option value="minimal">极少</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">极高</option></NativeSelect></label></details></div>}
        </section>

        {needsModel && <section aria-labelledby="model-settings" className="rounded-xl border border-slate-200 p-4"><h4 id="model-settings" className="mb-3 text-sm font-bold text-slate-800">模型设置</h4><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">模型提供方<Input aria-label="Provider" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} className="mt-2 w-full px-3 py-2.5" /></label><label className="text-xs font-semibold text-slate-600">模型<Input aria-label="Model ID" value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} className="mt-2 w-full px-3 py-2.5" /></label><section className="col-span-2 rounded-lg bg-slate-50 p-3"><label className="text-xs font-semibold text-slate-600"><KeyRound className="mr-1 inline h-3.5 w-3.5" />模型凭据<NativeSelect aria-label="模型凭据" value={draft.credentialRef} onChange={(event) => setDraft({ ...draft, credentialRef: event.target.value, ...(event.target.value ? { apiKeyEnv: '' } : {}) })} className="mt-2 w-full px-3 py-2.5"><option value="">选择本地安全凭据</option>{credentials.map((item) => <option key={item.ref} value={item.ref}>{item.label}</option>)}</NativeSelect></label>{desktopHostAvailable ? <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><Input aria-label="模型凭据名称" value={credentialDraft.label} onChange={(event) => setCredentialDraft({ ...credentialDraft, label: event.target.value })} placeholder="凭据名称" className="px-3 py-2" /><Input aria-label="模型 API Key" type="password" value={credentialDraft.secret} onChange={(event) => setCredentialDraft({ ...credentialDraft, secret: event.target.value })} placeholder="API Key" className="px-3 py-2" /><Button type="button" disabled={!credentialDraft.label.trim() || !credentialDraft.secret} onClick={createModelCredential} className="rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-white disabled:opacity-40">保存</Button></div> : <p className="mt-2 text-[11px] text-slate-400">浏览器模式不保存密钥；请使用桌面版安全存储，或在高级设置中填写开发环境变量名。</p>}</section><details className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">高级设置</summary><div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-slate-600">模型端点（OpenAI-compatible，必填）<Input aria-label="模型 Base URL" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} className="mt-2 w-full px-3 py-2.5" /></label><label className="block text-xs font-semibold text-slate-600">开发环境变量<Input value={draft.apiKeyEnv} onChange={(event) => setDraft({ ...draft, apiKeyEnv: event.target.value, ...(event.target.value.trim() ? { credentialRef: '' } : {}) })} placeholder="OPENAI_API_KEY" className="mt-2 w-full px-3 py-2.5" /></label></div></details></div></section>}

        {message && <p role="status" className="text-xs text-amber-700">{message}</p>}
        <Button variant="primary" type="button" disabled={saving || !valid} onClick={save} className="w-full py-3 text-xs">{saving ? '正在保存到此设备…' : '保存到此设备'}</Button>
        <div className="space-y-2 border-t border-slate-100 pt-4"><h4 className="text-xs font-bold text-slate-700">此设备上的执行配置</h4>{runtimeProfiles.length === 0 ? <p className="text-xs text-slate-400">尚无执行配置</p> : runtimeProfiles.map((profile) => { const usage = profileUsage(profile.id); return <div key={profile.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"><span><strong>{profile.name}</strong><small className="ml-2 text-slate-400">{harnessNames[profile.adapter === 'smalldash' ? 'smalldashharness' : profile.adapter]}</small></span><span className="text-[11px] font-semibold text-slate-400">{usage ? `${usage} 名助手正在使用` : '尚未绑定助手'}</span></div>; })}</div></>}
          </div>}
          {section === 'general' && <div className="space-y-7 p-7"><div><h3 className="text-lg font-bold text-slate-900">常规</h3><p className="mt-1 text-xs text-slate-400">WeWork 的设备级偏好与运行状态。</p></div><section className="divide-y divide-slate-100 rounded-xl border border-slate-200"><div className="flex items-center justify-between p-4"><div><strong className="text-sm text-slate-800">恢复上次工作位置</strong><p className="mt-1 text-xs text-slate-400">重新打开时回到上次团队、圆桌或工作流页面和视角；关闭后从第一个团队的圆桌开始。</p></div><button type="button" role="switch" aria-label="恢复上次工作位置" aria-checked={restoreTeams} onClick={() => { const next = !restoreTeams; setRestoreTeams(next); window.localStorage.setItem('wework.restoreTeams', String(next)); }} className={`relative h-6 w-11 rounded-full transition-colors ${restoreTeams ? 'bg-sky-500' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${restoreTeams ? 'left-6' : 'left-1'}`} /></button></div><div className="flex items-center justify-between p-4"><div><strong className="text-sm text-slate-800">数据模式</strong><p className="mt-1 text-xs text-slate-400">团队数据优先保存在当前设备。</p></div><span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">本地优先</span></div></section><section className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-3"><MonitorCog className="h-5 w-5 text-slate-500" /><div><strong className="text-sm text-slate-800">{desktopHostAvailable ? '桌面能力已连接' : '当前为浏览器模式'}</strong><p className="mt-1 text-xs text-slate-400">{desktopHostAvailable ? '可使用本地执行器、安全凭据和目录选择。' : '可管理团队和执行配置；本地执行器、安全凭据和目录选择需使用桌面版。'}</p></div></div></section></div>}
          {section === 'about' && <div className="space-y-7 p-7"><div><h3 className="text-lg font-bold text-slate-900">关于 WeWork</h3><p className="mt-1 text-xs text-slate-400">助手协同平台</p></div><section className="rounded-xl border border-slate-200 p-5"><strong className="text-sm text-slate-800">WeWork v2.0</strong><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">围绕团队、助手、任务、Workflow、Session、Workspace 和产物构建的本地优先协作应用。</p></section></div>}
        </main>
      </div>
    </section>
  </div>;
}
