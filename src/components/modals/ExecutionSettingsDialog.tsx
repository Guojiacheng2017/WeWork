import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cpu, Download, FolderGit2, Info, KeyRound, MonitorCog, RefreshCw, Settings2, X } from 'lucide-react';
import { useWeWorkStore } from '../../state/weworkStore';
import { weworkHost, type CredentialMetadata, type HarnessId, type HarnessInstallation, type HarnessModel, type HarnessModelInput, type SdhConnection, type WeWorkDataInfo } from '../../runtime/weworkHost';
import { harnessNames, harnessNeedsModel, harnessNeedsServiceUrl, harnessSupportsProfiles } from '../../runtime/harnessPresentation';
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

type SettingsSection = 'general' | 'execution' | 'storage' | 'about';

const settingsNavigation: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: '常规', icon: Settings2 },
  { id: 'execution', label: 'Harness', icon: Cpu },
  { id: 'storage', label: '工作区与安全', icon: FolderGit2 },
  { id: 'about', label: '关于平台', icon: Info },
];

export function ExecutionSettingsDialog({ onClose, initialSection = 'general' }: { onClose: () => void; initialSection?: SettingsSection | 'workspace' }) {
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
    const input: HarnessModelInput = { harness, ...modelDraft, api: 'openai-completions', verified: false };
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
    if (installation.harness !== 'smalldashharness') return;
    if (!installation.available || !installation.executionReady) return;
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

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/20 p-8 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="WeWork设置" className="flex h-[min(760px,calc(100vh-64px))] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-6"><div><h3 className="text-base font-bold text-slate-900">设置</h3><p className="mt-0.5 text-[11px] text-slate-400">配置这台设备上的WeWork</p></div><button type="button" aria-label="关闭设置" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-slate-100 bg-slate-50/60 p-4">
          <label className="mb-4 block"><span className="sr-only">搜索设置</span><input type="search" value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="搜索设置" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition-shadow focus:ring-2 focus:ring-sky-100" /></label>
          <p className="mb-2 px-2 text-[10px] font-bold tracking-wider text-slate-400">工作平台</p>
          <nav aria-label="设置分类" className="space-y-1">{settingsNavigation.filter((item) => item.label.toLowerCase().includes(settingsQuery.trim().toLowerCase())).map((item) => { const Icon = item.icon; const active = section === item.id; return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${active ? 'bg-slate-200/80 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" /><span>{item.label}</span></button>; })}</nav>
          <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2 px-2 text-[10px] text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />本地模式</div></div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {section === 'storage' && <DataWorkspaceSettings dataInfo={dataInfo} />}
          {section === 'execution' && <div className="space-y-5 p-7">
            <div><h3 className="text-lg font-bold text-slate-900">Harness</h3><p className="mt-1 text-xs text-slate-400">连接并管理可供助手使用的 Harness；这里管理远程 SDH 的可用/默认模型，助手配置负责选择模型。</p></div>
        <section className="rounded-xl border border-slate-200 p-4"><h4 className="text-sm font-bold text-slate-800">远程 smalldashharness</h4><p className="mt-1 text-[11px] leading-5 text-slate-400">填写 Docker 暴露给当前设备的地址，例如 http://192.168.1.20:23334。这里不是模型 Base URL。</p><div className="mt-3 flex gap-2"><input aria-label="SDH 服务地址" value={sdhConnection.baseUrl} onChange={(event) => setSdhConnection({ baseUrl: event.target.value, configured: Boolean(event.target.value.trim()) })} placeholder="http://&lt;远程机器&gt;:23334" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button type="button" disabled={saving || !sdhConnection.baseUrl.trim()} onClick={async()=>{setSaving(true);try{const saved=await weworkHost.setSdhConnection(sdhConnection.baseUrl);setSdhConnection(saved);setMessage('远程 smalldashharness 已连接');await refreshHarnesses();}catch(error){setMessage(error instanceof Error?error.message:String(error));}finally{setSaving(false);}}} className="rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-40">保存并测试</button></div><p className={`mt-2 text-[10px] ${sdhConnection.reachable?'text-emerald-600':'text-slate-400'}`}>{sdhConnection.reachable?'● 已连接远程 SDH':sdhConnection.error??'保存时会调用远程 /health 检查服务'}</p></section>
        <section aria-labelledby="local-harnesses">
          <div className="mb-3 flex items-center justify-between gap-3"><div><h4 id="local-harnesses" className="text-sm font-bold text-slate-800">可用 Harness</h4><p className="mt-1 text-[11px] text-slate-400">SDH 是远程服务；其他 Harness 仅展示本机探测结果。助手使用哪个 Harness，在助手配置中选择。</p></div><button type="button" disabled={loadingHarnesses || !desktopHostAvailable} onClick={() => void refreshHarnesses()} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${loadingHarnesses ? 'animate-spin' : ''}`} />重新检测</button></div>
          <div className="grid grid-cols-2 gap-2">{installations.filter((item) => item.available).map((item) => {
            const allowed = allowedHarnesses.includes(item.harness);
            const canAllow = Boolean(item.harness === 'smalldashharness' && item.executionReady && desktopHostAvailable);
            const iconSource = harnessIconSources[item.harness];
            return <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center">{iconSource ? <img src={iconSource} alt="" className="h-6 w-6 object-contain" /> : <Cpu className="h-6 w-6 text-slate-500" />}</span><strong className="flex-1 text-xs text-slate-800">{harnessNames[item.harness]}</strong><span className={`text-[10px] font-semibold ${item.executionReady ? 'text-emerald-600' : 'text-slate-400'}`}>{item.executionReady ? '● 可以运行' : '仅检测到安装'}</span></div><p className="mt-2 truncate text-[10px] text-slate-400">{item.kind === 'embedded' ? 'WeWork 内置' : item.executablePath ?? installHelp[item.harness]}</p>{item.version && <p className="mt-1 text-[9px] text-slate-400">{item.version}{item.reason ? ` · ${item.reason}` : ''}</p>}<div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[10px] font-medium text-slate-500">允许助手使用</span><button type="button" role="switch" aria-label={`允许助手使用 ${harnessNames[item.harness]}`} aria-checked={allowed && canAllow} disabled={!canAllow} onClick={() => void toggleAllowed(item)} className={`relative h-5 w-9 rounded-full transition-colors ${allowed && canAllow ? 'bg-emerald-500' : 'bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${allowed && canAllow ? 'left-[18px]' : 'left-0.5'}`} /></button></div>{!item.executionReady && <p className="mt-2 text-[9px] leading-4 text-slate-400">WeWork 已找到这个命令，但尚未验证启动、消息、工具调用、取消和 Session 恢复，因此暂不能交给助手运行。</p>}</article>;
          })}</div>
        </section>
        <HarnessModelCatalog harness={harness} setHarness={setHarness} installations={configurableInstallations.filter((item) => item.harness === 'smalldashharness')} models={models} draft={modelDraft} setDraft={setModelDraft} saving={saving} save={() => void saveAvailableModel()} chooseDefault={(model) => void chooseDefaultModel(model)} />

        {false && <><section aria-labelledby="harness-settings" className="rounded-xl border border-slate-200 p-4"><div className="mb-3"><h4 id="harness-settings" className="text-sm font-bold text-slate-800">新建执行配置</h4><p className="mt-1 text-[11px] text-slate-400">执行配置保存 Harness、模型和凭据引用，创建或编辑助手时再进行绑定。</p></div>{configurableInstallations.length > 0 && <label className="mb-4 block text-xs font-semibold text-slate-600">Harness<select aria-label="执行配置 Harness" value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{configurableInstallations.map((item) => <option key={item.id} value={item.harness}>{harnessNames[item.harness]}</option>)}</select></label>}
          {!selectedInstallation?.executionReady || !allowedHarnesses.includes(harness) ? <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><Download className="mt-0.5 h-4 w-4 shrink-0" /><span>{desktopHostAvailable ? '请先在上方允许一个执行就绪的 Harness，才能创建助手执行配置。' : '浏览器模式无法探测本机 Harness，请在桌面版配置执行。'}</span></div> : <div className="grid grid-cols-2 gap-3"><label className="col-span-2 text-xs font-semibold text-slate-600">执行配置名称<input aria-label="执行配置名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>{needsServiceUrl && <label className="col-span-2 text-xs font-semibold text-slate-600">执行器服务地址<input aria-label="Harness 服务地址" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="http://127.0.0.1:3001" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>}{!needsModel && !needsServiceUrl && <div className="col-span-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700"><p><CheckCircle2 className="mr-1 inline h-4 w-4" />使用该 CLI 自身的登录状态，不需要在 WeWork 重复填写 API Key。</p><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]"><dt className="text-emerald-700/70">模型来源</dt><dd>由 {harnessNames[harness]} 管理</dd><dt className="text-emerald-700/70">当前模型</dt><dd className="font-semibold">{selectedInstallation.configuration?.modelId ?? 'Harness 未显式指定（使用其默认模型）'}</dd>{selectedInstallation.configuration?.provider && <><dt className="text-emerald-700/70">提供方</dt><dd>{selectedInstallation.configuration.provider}</dd></>}</dl>{!harnessSupportsProfiles(harness) && <p className="mt-2 text-emerald-700/70">当前版本仅完成安全探测，执行适配器将在后续接入。</p>}</div>}<details className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">高级设置</summary><label className="mt-3 block text-xs font-semibold text-slate-600">思考级别<select value={draft.thinkingLevel} onChange={(event) => setDraft({ ...draft, thinkingLevel: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="off">关闭</option><option value="minimal">极少</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">极高</option></select></label></details></div>}
        </section>

        {needsModel && <section aria-labelledby="model-settings" className="rounded-xl border border-slate-200 p-4"><h4 id="model-settings" className="mb-3 text-sm font-bold text-slate-800">模型设置</h4><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-600">模型提供方<input aria-label="Provider" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label><label className="text-xs font-semibold text-slate-600">模型<input aria-label="Model ID" value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label><section className="col-span-2 rounded-lg bg-slate-50 p-3"><label className="text-xs font-semibold text-slate-600"><KeyRound className="mr-1 inline h-3.5 w-3.5" />模型凭据<select aria-label="模型凭据" value={draft.credentialRef} onChange={(event) => setDraft({ ...draft, credentialRef: event.target.value, ...(event.target.value ? { apiKeyEnv: '' } : {}) })} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">选择本地安全凭据</option>{credentials.map((item) => <option key={item.ref} value={item.ref}>{item.label}</option>)}</select></label>{desktopHostAvailable ? <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label="模型凭据名称" value={credentialDraft.label} onChange={(event) => setCredentialDraft({ ...credentialDraft, label: event.target.value })} placeholder="凭据名称" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /><input aria-label="模型 API Key" type="password" value={credentialDraft.secret} onChange={(event) => setCredentialDraft({ ...credentialDraft, secret: event.target.value })} placeholder="API Key" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" /><button type="button" disabled={!credentialDraft.label.trim() || !credentialDraft.secret} onClick={createModelCredential} className="rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-white disabled:opacity-40">保存</button></div> : <p className="mt-2 text-[11px] text-slate-400">浏览器模式不保存密钥；请使用桌面版安全存储，或在高级设置中填写开发环境变量名。</p>}</section><details className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">高级设置</summary><div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-slate-600">模型端点（OpenAI-compatible，必填）<input aria-label="模型 Base URL" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs" /></label><label className="block text-xs font-semibold text-slate-600">开发环境变量<input value={draft.apiKeyEnv} onChange={(event) => setDraft({ ...draft, apiKeyEnv: event.target.value, ...(event.target.value.trim() ? { credentialRef: '' } : {}) })} placeholder="OPENAI_API_KEY" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs" /></label></div></details></div></section>}

        {message && <p role="status" className="text-xs text-amber-700">{message}</p>}
        <button type="button" disabled={saving || !valid} onClick={save} className="w-full rounded-lg bg-slate-900 py-3 text-xs font-semibold text-white disabled:opacity-40">{saving ? '正在保存到此设备…' : '保存到此设备'}</button>
        <div className="space-y-2 border-t border-slate-100 pt-4"><h4 className="text-xs font-bold text-slate-700">此设备上的执行配置</h4>{runtimeProfiles.length === 0 ? <p className="text-xs text-slate-400">尚无执行配置</p> : runtimeProfiles.map((profile) => { const usage = profileUsage(profile.id); return <div key={profile.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"><span><strong>{profile.name}</strong><small className="ml-2 text-slate-400">{harnessNames[profile.adapter === 'smalldash' ? 'smalldashharness' : profile.adapter]}</small></span><span className="text-[10px] font-semibold text-slate-400">{usage ? `${usage} 名助手正在使用` : '尚未绑定助手'}</span></div>; })}</div></>}
          </div>}
          {section === 'general' && <div className="space-y-7 p-7"><div><h3 className="text-lg font-bold text-slate-900">常规</h3><p className="mt-1 text-xs text-slate-400">WeWork 的设备级偏好与运行状态。</p></div><section className="divide-y divide-slate-100 rounded-xl border border-slate-200"><div className="flex items-center justify-between p-4"><div><strong className="text-sm text-slate-800">恢复上次工作位置</strong><p className="mt-1 text-xs text-slate-400">重新打开时回到上次团队、圆桌或 DAG 页面和视角；关闭后从第一个团队的圆桌开始。</p></div><button type="button" role="switch" aria-label="恢复上次工作位置" aria-checked={restoreTeams} onClick={() => { const next = !restoreTeams; setRestoreTeams(next); window.localStorage.setItem('wework.restoreTeams', String(next)); }} className={`relative h-6 w-11 rounded-full transition-colors ${restoreTeams ? 'bg-sky-500' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${restoreTeams ? 'left-6' : 'left-1'}`} /></button></div><div className="flex items-center justify-between p-4"><div><strong className="text-sm text-slate-800">数据模式</strong><p className="mt-1 text-xs text-slate-400">团队数据优先保存在当前设备。</p></div><span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">本地优先</span></div></section><section className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-3"><MonitorCog className="h-5 w-5 text-slate-500" /><div><strong className="text-sm text-slate-800">{desktopHostAvailable ? '桌面能力已连接' : '当前为浏览器模式'}</strong><p className="mt-1 text-xs text-slate-400">{desktopHostAvailable ? '可使用本地执行器、安全凭据和目录选择。' : '可管理团队和执行配置；本地执行器、安全凭据和目录选择需使用桌面版。'}</p></div></div></section></div>}
          {section === 'about' && <div className="space-y-7 p-7"><div><h3 className="text-lg font-bold text-slate-900">关于 WeWork</h3><p className="mt-1 text-xs text-slate-400">助手协同平台</p></div><section className="rounded-xl border border-slate-200 p-5"><strong className="text-sm text-slate-800">WeWork v2.0</strong><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">围绕团队、助手、任务、Workflow、Session、Workspace 和产物构建的本地优先协作应用。</p></section></div>}
        </main>
      </div>
    </section>
  </div>;
}
