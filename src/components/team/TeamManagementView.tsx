import { useEffect, useState } from 'react';
import { Circle, Columns3, Crown, FolderGit2, LayoutList, MessageCircle, Plus, RotateCcw, Search, Send, Settings2, Trash2, UserRound, UsersRound, Wrench, X } from 'lucide-react';
import { normalizeWorkspaceAssignment, type WeWorkEmployee, type WeWorkTeam, type SessionExecution, type SkillRef, type WorkItem, type WorkspaceAssignment } from '../../domain/wework';
import { useWeWorkStore } from '../../state/weworkStore';
import { weworkHost, type AvailableSkill, type HarnessId, type HarnessInstallation, type HarnessModel } from '../../runtime/weworkHost';
import { executionWithCatalogModel, migrateLegacyCatalogSelection } from './workspaceDraft';
import { PROJECT_CAPABILITIES, type ProjectCapability } from '../../domain/collaboration';

const adapterHarness = (adapter: SessionExecution['adapter']): HarnessId => adapter === 'smalldash' ? 'smalldashharness' : adapter;
const harnessAdapter = (harness: HarnessId): SessionExecution['adapter'] => harness === 'smalldashharness' ? 'smalldash' : harness;

export function EmployeeConfigDialog({ employee, team, onClose }: { employee: WeWorkEmployee; team?: WeWorkTeam; onClose: () => void }) {
  const { updateEmployee, resetEmployeeContext, teams } = useWeWorkStore();
  const owningTeam = team ?? teams.find((candidate) => candidate.employees.some((employee) => employee.id === employee.id));
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [roleName, setRoleName] = useState(employee.roleName);
  const [runtime, setRuntime] = useState<WeWorkEmployee['runtime']>(employee.runtime);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState(employee.builtInSkills.map((skill) => skill.id));
  const [skillMessage, setSkillMessage] = useState('正在读取 Skill Pool…');
  const [contextTags, setContextTags] = useState((employee.activeSession.contextTagIds ?? []).join(', '));
  const [defaultRuntimeProfileId, setDefaultRuntimeProfileId] = useState(employee.defaultRuntimeProfileId ?? '');
  const [weworkRoot, setWeWorkRoot] = useState('~/Documents/WeWork');
  const teamWorkspacePath = owningTeam?.workspaceAssignment?.kind === 'local' && owningTeam.workspaceAssignment.rootPath
    ? owningTeam.workspaceAssignment.rootPath : `${weworkRoot.replace(/[\\/]$/, '')}/${owningTeam?.id ?? 'team'}`;
  const employeeDefaultPath = `${teamWorkspacePath.replace(/[\\/]$/, '')}/employees/${employee.id}`;
  const persistedEmployeePath = employee.workspaceAssignment?.kind === 'local' ? employee.workspaceAssignment.rootPath ?? '' : '';
  const [localRootPath, setLocalRootPath] = useState(persistedEmployeePath || employeeDefaultPath);
  const [saving, setSaving] = useState(false);
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const [hostMessage, setHostMessage] = useState('');
  const [availableHarnesses, setAvailableHarnesses] = useState<HarnessInstallation[]>([]);
  const [harnessModels, setHarnessModels] = useState<HarnessModel[]>([]);
  const [defaultHarnessModels, setDefaultHarnessModels] = useState<Partial<Record<HarnessId, string>>>({});
  const initialExecution = employee.activeSession.execution;
  const [sessionExecution, setSessionExecution] = useState<SessionExecution>(() => initialExecution ?? {
    id: `session-${employee.id}`, name: `${employee.displayName} Session`, adapter: 'smalldash',
    model: { provider: 'openai', modelId: '', api: 'openai-completions', baseUrl: '' },
    systemPrompt: '', thinkingLevel: 'off', enabled: true, profileRevision: 1,
  });

  useEffect(() => {
    setDisplayName(employee.displayName); setRoleName(employee.roleName); setRuntime(employee.runtime);
    setDefaultRuntimeProfileId(employee.defaultRuntimeProfileId ?? '');
    setSelectedSkillIds(employee.builtInSkills.map((skill) => skill.id));
    setContextTags((employee.activeSession.contextTagIds ?? []).join(', '));
    setLocalRootPath(employee.workspaceAssignment?.kind === 'local' && employee.workspaceAssignment.rootPath ? employee.workspaceAssignment.rootPath : employeeDefaultPath);
    if (employee.activeSession.execution) setSessionExecution(employee.activeSession.execution);
  }, [employee]);

  useEffect(() => {
    void Promise.all([weworkHost.harnesses(), weworkHost.harnessPolicy(), weworkHost.harnessModels()]).then(([items, policy, catalog]) => {
      setAvailableHarnesses(items.filter((item) => item.executionReady && policy.allowedHarnesses.includes(item.harness)));
      const availableModels = catalog.models;
      setHarnessModels(availableModels); setDefaultHarnessModels(catalog.defaults);
      setSessionExecution((current) => {
        const migrated = migrateLegacyCatalogSelection(current, availableModels);
        if (migrated.modelCatalogId && availableModels.some((model) => model.id === migrated.modelCatalogId && model.harness === adapterHarness(migrated.adapter))) return migrated;
        const harness = adapterHarness(current.adapter);
        const selected = availableModels.find((model) => model.id === catalog.defaults[harness]) ?? availableModels.find((model) => model.harness === harness);
        return selected ? executionWithCatalogModel(current, selected) : current;
      });
    }).catch(() => { setAvailableHarnesses([]); setHarnessModels([]); setDefaultHarnessModels({}); });
  }, []);
  useEffect(() => { void weworkHost.dataInfo().then((info) => { setWeWorkRoot(info.rootPath); if (!persistedEmployeePath && owningTeam?.workspaceAssignment?.kind !== 'local') setLocalRootPath(`${info.rootPath.replace(/[\\/]$/, '')}/${owningTeam?.id ?? 'team'}/employees/${employee.id}`); }).catch(() => {}); }, [employee.id, owningTeam?.id, persistedEmployeePath]);

  const skillWorkspace = (): WorkspaceAssignment => ({ kind: 'local', rootPath: localRootPath.trim() || employeeDefaultPath });
  const loadSkills = async () => {
    setSkillMessage('正在读取 Skill Pool…');
    try {
      const draft = skillWorkspace();
      const result = await weworkHost.skills({
        teamId: owningTeam?.id, employeeId: employee.id,
        ...(owningTeam ? { team: { id: owningTeam.id, name: owningTeam.name, workspaceAssignment: owningTeam.workspaceAssignment } } : {}),
        employee: { id: employee.id, displayName: employee.displayName, workspaceAssignment: employee.workspaceAssignment },
        inheritTeam: false,
        workspaceAssignment: draft,
      });
      setAvailableSkills(result.skills);
      setSkillMessage(result.reason ?? (result.skills.length ? '' : '没有发现可用 Skill 包'));
    } catch (error) {
      setAvailableSkills([]);
      setSkillMessage(error instanceof Error ? error.message : String(error));
    }
  };
  useEffect(() => { void loadSkills(); }, [employee.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedHarness = adapterHarness(sessionExecution.adapter);
  const selectableModels = harnessModels.filter((model) => model.harness === selectedHarness);
  const sessionHasContext = employee.activeSession.messages.length > 0 || employee.activeSession.metrics.length > 0 || employee.activeSession.contextRatio > 0;

  const save = async () => {
    const knownSkills = new Map([...employee.builtInSkills, ...availableSkills].map((skill) => [skill.id, skill]));
    const skills: SkillRef[] = selectedSkillIds.map((id) => knownSkills.get(id)).filter((skill): skill is SkillRef => Boolean(skill)).map(({ id, name }) => ({ id, name }));
    setSaving(true);
    const workspaceAssignment: WorkspaceAssignment = { kind: 'local', rootPath: localRootPath.trim() || employeeDefaultPath };
    const priorExecution = employee.activeSession.execution;
    const nextExecution: SessionExecution = { ...sessionExecution, name: sessionExecution.name.trim(), profileRevision: (priorExecution?.profileRevision ?? 0) + 1 };
    const executionChanged = JSON.stringify({ ...priorExecution, profileRevision: 0 }) !== JSON.stringify({ ...nextExecution, profileRevision: 0 });
    const startNewSession = sessionHasContext && (!priorExecution || priorExecution.adapter !== nextExecution.adapter);
    const sessionContextTagIds = [...new Set(contextTags.split(',').map((tag) => tag.trim()).filter(Boolean))];
    try {
      await updateEmployee(employee.id, { displayName: displayName.trim(), roleName: roleName.trim(), runtime, skills, defaultRuntimeProfileId: defaultRuntimeProfileId || undefined, workspaceAssignment, sessionExecution: executionChanged ? nextExecution : undefined, sessionContextTagIds, startNewSession });
      onClose();
    } catch (error) {
      setHostMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const resetContext = async () => {
    if (!window.confirm(`确定清空 ${employee.displayName} 的会话上下文吗？该操作会开启一个全新的会话。`)) return;
    setSaving(true); await resetEmployeeContext(employee.id); setSaving(false);
  };
  const workspaceValid = Boolean(localRootPath.trim());
  const sessionValid = JSON.stringify(sessionExecution) === JSON.stringify(initialExecution) || Boolean(sessionExecution.name.trim() && (selectedHarness !== 'smalldashharness'
    ? sessionExecution.model.modelId
    : sessionExecution.modelCatalogId && selectableModels.some((model) => model.id === sessionExecution.modelCatalogId)));
  const employeeConfigurationValid = !window.weworkHost || sessionValid;
  const showHostError = (error: unknown) => setHostMessage(error instanceof Error && error.message.includes('WeWork desktop host') ? '此功能需要 WeWork Desktop Host' : error instanceof Error ? error.message : String(error));
  const chooseWorkspace = async () => { if (choosingWorkspace) return; setChoosingWorkspace(true); setHostMessage(''); try { const workspace = await weworkHost.chooseLocalWorkspace(); if (workspace) { setLocalRootPath(workspace.rootPath); setHostMessage(`已选择：${workspace.rootPath}`); } } catch (error) { showHostError(error); } finally { setChoosingWorkspace(false); } };

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/20 p-8 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`配置 ${employee.displayName}`} className="flex max-h-[calc(100vh-64px)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="text-base font-bold text-slate-900">助手配置</h3><p className="mt-1 text-xs text-slate-400">管理角色、运行环境、技能与当前上下文</p></div><button type="button" aria-label="关闭助手配置" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 grid grid-cols-2 gap-5 overflow-y-auto overscroll-contain p-6">
        <label className="text-xs font-semibold text-slate-600">助手名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
        <label className="text-xs font-semibold text-slate-600">角色 / 职责<input value={roleName} onChange={(event) => setRoleName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-sky-400" /></label>
        <section className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="上下文管理"><div className="flex items-start justify-between gap-5"><div className="min-w-0 flex-1"><div className="flex items-center justify-between text-xs"><strong className="text-slate-700">当前上下文</strong><span className="font-semibold text-slate-500">{employee.activeSession.contextRatio}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${employee.activeSession.contextRatio}%` }} /></div><p className="mt-2 text-[11px] text-slate-400">会话 {employee.activeSession.id.slice(0, 8)} · {employee.activeSession.messages.length} 条消息 · {employee.activeSession.metrics.length} 项指标</p></div><button type="button" disabled={saving} onClick={resetContext} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />清空上下文</button></div><label className="mt-4 block border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-600">订阅群聊上下文 Tag<input aria-label="Session 上下文 Tag" value={contextTags} onChange={(event) => setContextTags(event.target.value)} placeholder="例如：项目事实, 质检（逗号分隔）" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal" /><span className="mt-1.5 block font-normal leading-4 text-slate-400">只有带匹配 Tag 的群聊消息会进入此 Session；直接发给该助手的触发消息始终可见。</span></label></section>
        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="Workspace 设置">
          <div className="flex items-center gap-2"><FolderGit2 className="h-4 w-4 text-slate-500" /><div><strong className="block text-xs text-slate-700">Workspace</strong><span className="text-[10px] text-slate-400">该助手执行任务时使用的唯一目录</span></div></div>
          <div className="mt-4 flex gap-2"><input aria-label="助手 Workspace 路径" value={localRootPath} onChange={(event) => { setLocalRootPath(event.target.value); setHostMessage(''); }} placeholder={employeeDefaultPath} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-400" /><button type="button" disabled={choosingWorkspace} onClick={() => void chooseWorkspace()} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 disabled:opacity-50">{choosingWorkspace ? '选择中…' : '选择目录'}</button></div>
          {hostMessage && <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{hostMessage}</p>}
        </section>
        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="Session 执行设置">
          <div><strong className="block text-xs text-slate-700">当前 Session 的 Harness 与模型</strong><span className="mt-0.5 block text-[10px] text-slate-400">只影响这名助手当前及后续 Session；设备设置仅决定哪些 Harness 可以使用。</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-semibold text-slate-600">Harness<select aria-label="Session Harness" value={selectedHarness} onChange={(event) => { const nextHarness = event.target.value as HarnessId; const candidates = harnessModels.filter((model) => model.harness === nextHarness); const selected = candidates.find((model) => model.id === defaultHarnessModels[nextHarness]) ?? candidates[0]; setSessionExecution(selected ? executionWithCatalogModel(sessionExecution, selected) : { ...sessionExecution, adapter: harnessAdapter(nextHarness), modelCatalogId: undefined, model: nextHarness === 'smalldashharness' ? { provider: '', modelId: '' } : { provider: nextHarness, modelId: 'default' } }); setRuntime(nextHarness === 'pi' ? 'Pi' : nextHarness === 'claude-code' ? 'Claude Code' : nextHarness === 'smalldashharness' ? 'DSH' : 'Workspace'); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{availableHarnesses.map((item) => <option key={item.id} value={item.harness}>{item.harness === 'smalldashharness' ? 'smalldashharness（WeWork 内置）' : item.harness}</option>)}</select>{sessionHasContext && (!initialExecution || initialExecution.adapter !== sessionExecution.adapter) && <span className="mt-1.5 block text-[10px] font-normal leading-4 text-amber-600">保存后将开启新 Session，旧 Harness 上下文不会混入。</span>}</label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">配置名称<input value={sessionExecution.name} onChange={(event) => setSessionExecution({ ...sessionExecution, name: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs" /></label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">模型<select aria-label="Session 模型" value={sessionExecution.modelCatalogId ?? ''} onChange={(event) => { const selected = selectableModels.find((model) => model.id === event.target.value); if (selected) setSessionExecution(executionWithCatalogModel(sessionExecution, selected)); else if (selectedHarness !== 'smalldashharness') setSessionExecution({ ...sessionExecution, modelCatalogId: undefined, model: { provider: selectedHarness, modelId: 'default' } }); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">{selectedHarness === 'smalldashharness' ? '选择已验证模型' : '跟随 Harness 默认模型'}</option>{selectableModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}/{model.modelId}{model.id === defaultHarnessModels[selectedHarness] ? '（当前默认）' : ''}</option>)}</select></label>
            {selectedHarness === 'smalldashharness' ? (selectableModels.length ? <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">SDH 的模型连接由 WeWork 管理；同一 Session 内切换模型时继续使用 SDH 的原生上下文与 compaction。</p> : <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">SDH 尚无已验证模型，请先在“执行器与模型”中添加并验证。</p>) : <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">登录状态、模型目录、默认模型、连接参数和 compaction 均由 {selectedHarness} 管理。WeWork 只保存助手选择的模型引用，不保存 URL 或凭据。</p>}
          </div>
        </section>
        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="助手 Skills 与 Persona"><div className="flex items-start justify-between gap-3"><div><strong className="block text-xs text-slate-700">Skills 与 Persona</strong><span className="mt-0.5 block text-[10px] text-slate-400">从 WeWork 业务技能与当前 Workspace 的 Skill Pool 绑定真实技能包。</span></div><button type="button" onClick={() => void loadSkills()} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-sky-300"><RotateCcw className="h-3 w-3" />重新扫描</button></div><div className="mt-4 grid grid-cols-2 gap-4"><div className="col-span-2"><div className="grid grid-cols-2 gap-2">{availableSkills.map((skill) => <label key={skill.id} className={`flex cursor-pointer gap-2 rounded-lg border p-3 transition ${selectedSkillIds.includes(skill.id) ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><input type="checkbox" checked={selectedSkillIds.includes(skill.id)} onChange={(event) => setSelectedSkillIds((ids) => event.target.checked ? [...new Set([...ids, skill.id])] : ids.filter((id) => id !== skill.id))} className="mt-0.5 accent-sky-600" /><span className="min-w-0"><span className="flex items-center gap-2 text-xs font-semibold text-slate-700">{skill.name}<i className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] not-italic font-medium text-slate-500">{skill.source === 'wework' ? 'WeWork 业务技能' : '当前 Workspace'}</i></span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{skill.description || skill.id}</span></span></label>)}{employee.builtInSkills.filter((skill) => !availableSkills.some((available) => available.id === skill.id)).map((skill) => <label key={skill.id} className="flex cursor-pointer gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><input type="checkbox" checked={selectedSkillIds.includes(skill.id)} onChange={(event) => setSelectedSkillIds((ids) => event.target.checked ? [...new Set([...ids, skill.id])] : ids.filter((id) => id !== skill.id))} className="mt-0.5 accent-amber-600" /><span><span className="text-xs font-semibold text-slate-700">{skill.name}</span><span className="mt-1 block text-[10px] text-amber-700">已绑定，但当前 Skill Pool 中不可用</span></span></label>)}</div>{skillMessage && <p role="status" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500">{skillMessage}。Workspace Skill 目录：skills/&lt;skill-id&gt;/SKILL.md</p>}</div><label className="col-span-2 text-xs font-semibold text-slate-600">Persona / Session 指令<textarea value={sessionExecution.systemPrompt} onChange={(event) => setSessionExecution({ ...sessionExecution, systemPrompt: event.target.value })} placeholder="描述该助手在当前 Session 中应坚持的身份、视角和工作方式" className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5" /></label></div></section>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" disabled={saving || !displayName.trim() || !roleName.trim() || !workspaceValid || !employeeConfigurationValid} onClick={save} className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? '保存中…' : '保存配置'}</button></footer>
    </section>
  </div>;
}

const issueTone: Record<WorkItem['status'], { label: string; dot: string }> = {
  pending: { label: 'Backlog', dot: 'bg-slate-400' }, running: { label: 'In progress', dot: 'bg-amber-500' }, completed: { label: 'Done', dot: 'bg-emerald-500' }, blocked: { label: 'Blocked', dot: 'bg-rose-500' },
};
function teamIssues(team: WeWorkTeam) {
  return [...team.pendingWorks, ...team.employees.flatMap((employee) => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? [])].filter((work): work is WorkItem => Boolean(work)))].filter((work, index, all) => all.findIndex((item) => item.id === work.id) === index);
}

function ContextTagComposer({ value, suggestions, onChange }: { value: string[]; suggestions: string[]; onChange: (value: string[]) => void }) {
  const [query, setQuery] = useState('');
  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#+/, '').slice(0, 60);
    if (tag && !value.includes(tag)) onChange([...value, tag].slice(0, 20));
    setQuery('');
  };
  const hashtagQuery = query.trim().startsWith('#') ? query.trim().slice(1) : null;
  const matches = hashtagQuery === null ? [] : suggestions.filter((tag) => !value.includes(tag) && (!hashtagQuery || tag.toLocaleLowerCase().includes(hashtagQuery.toLocaleLowerCase()))).slice(0, 8);
  return <div className="relative flex w-full flex-wrap items-center gap-1.5 border-b border-slate-100 px-2 pb-2 text-[10px]">
    {value.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700"><span>{tag}</span><button type="button" aria-label={`移除 ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))} className="rounded-full text-slate-400 hover:text-slate-800"><X className="h-3 w-3" /></button></span>)}
    <input aria-label="添加群聊上下文 Tag" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ',' || event.key === ' ') && query.trim()) { event.preventDefault(); add(query); } else if (event.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1)); }} placeholder={value.length ? '输入 # 添加标签' : '输入 # 添加上下文标签'} className="min-w-[150px] flex-1 bg-transparent py-1 text-[11px] font-normal text-slate-700 outline-none" />
    {hashtagQuery !== null && matches.length > 0 && <div role="listbox" aria-label="可选上下文 Tag" className="absolute bottom-full left-0 mb-2 flex min-w-[240px] flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">{matches.map((tag) => <button key={tag} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => add(tag)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-700">{tag}</button>)}</div>}
  </div>;
}

function TeamChatView({ team }: { team: WeWorkTeam }) {
  const sendTeamMessage = useWeWorkStore((state) => state.sendTeamMessage);
  const cancelGroupDelivery=useWeWorkStore(state=>state.cancelGroupDelivery);
  const messages = (team.teamMessages ?? []).map((message) => ({ ...message, senderName: message.contextTagIds?.length ? `${message.senderName ?? 'WeWork'} · ${message.contextTagIds.map((tag) => `#${tag}`).join(' ')}` : message.senderName }));
  const [draft, setDraft] = useState('');
  const [recipientId,setRecipientId]=useState('');
  const [tagDraft,setTagDraft]=useState<string[]>([]);
  const [sending,setSending]=useState(false);
  const [sendError,setSendError]=useState('');
  useEffect(() => { setDraft(''); setRecipientId(''); setTagDraft([]); setSendError(''); }, [team.id]);
  const submit = async () => {
    const text=draft.trim(); if(!text || sending)return;
    setSending(true);setSendError('');
    try { await sendTeamMessage(team.id,text,recipientId || undefined,tagDraft); setDraft(''); setTagDraft([]); }
    catch(error) {setSendError(error instanceof Error?error.message:String(error));}
    finally {setSending(false);}
  };
  const tagSuggestions = [...new Set([
    ...(team.teamMessages ?? []).flatMap((message) => message.contextTagIds ?? []),
    ...team.employees.flatMap((employee) => employee.activeSession.contextTagIds ?? []),
  ])];
  return <div className="relative grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] overflow-hidden bg-white">
    <aside className="min-h-0 overflow-y-auto border-r border-slate-100 bg-slate-50/70 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><UsersRound className="h-4 w-4" />#{team.name}</div><p className="mt-1 text-[10px] text-slate-400">{team.employees.length} 位成员</p><div className="mt-5 space-y-1">{team.employees.map((employee) => <button key={employee.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white"><span className="h-6 w-6 rounded-full" style={{ background: employee.color }} /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{employee.displayName}</span><span className={`h-1.5 w-1.5 rounded-full ${employee.status === 'working' ? 'bg-amber-400' : 'bg-emerald-500'}`} /></button>)}</div></aside>
    <section className="flex min-h-0 min-w-0 flex-col"><header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-5"><div><h4 className="text-xs font-bold text-slate-900">团队群聊</h4><p className="mt-0.5 text-[10px] text-slate-400">共享进展、决策和交接信息</p></div><button type="button" aria-label="搜索群聊" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><Search className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{messages.map((message) => <article key={message.id} className="flex gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${message.sender === 'user' ? 'bg-slate-900' : 'bg-rose-600'}`}>{message.sender === 'user' ? 'ME' : 'EMPLOYEE'}</span><div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-[11px] text-slate-800">{message.senderName ?? 'WeWork'}</strong><time className="text-[9px] text-slate-400">{message.time}</time></div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{message.text}</p></div></article>)}</div><div className="shrink-0 border-t border-slate-100 px-5 py-2 text-xs"><label>回复助手 <select aria-label="群聊回复助手" value={recipientId} onChange={event=>setRecipientId(event.target.value)} className="ml-2 rounded border border-slate-200 p-1"><option value="">团队负责人</option>{team.employees.map(employee=><option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></label>{!window.weworkHost && <p className="mt-1 text-amber-700">浏览器模式可保存消息；助手执行需要桌面 Host。</p>}{sendError && <p role="alert" className="mt-1 text-red-600">{sendError}</p>}{(team.collaborationDeliveries ?? []).filter(item=>item.status!=='succeeded').slice(-4).map(item=><p key={item.id} className="mt-1 text-slate-500">{team.employees.find(employee=>employee.id===item.employeeId)?.displayName} · {{queued:'排队中',running:'正在回复',failed:'执行失败',cancelled:'已取消',uncertain:'执行结果待核对'}[item.status as 'queued'|'running'|'failed'|'cancelled'|'uncertain']}{item.error ? `：${item.error}` : ''}{(item.status==='queued' || item.status==='running') && <button type="button" onClick={()=>void cancelGroupDelivery(team.id,item.id).catch(error=>setSendError(error.message))} className="ml-2 underline">取消这次回复</button>}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="m-4 flex flex-wrap shrink-0 items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-slate-300"><ContextTagComposer value={tagDraft} onChange={setTagDraft} suggestions={tagSuggestions} /><textarea aria-label="发送团队消息" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder={`发送到 #${team.name} · Enter 发送，Shift+Enter 换行`} className="min-h-10 flex-1 resize-none px-2 py-2 text-xs outline-none" /><button type="submit" disabled={!draft.trim() || sending} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-white disabled:opacity-30"><Send className="h-4 w-4" /></button></form></section>
  </div>;
}

export function TeamIssuesView({ team }: { team: WeWorkTeam }) {
  const updateWorkItem = useWeWorkStore((state) => state.updateWorkItem);
  const dispatchWorkToEmployee = useWeWorkStore((state) => state.dispatchWorkToEmployee);
  const completeCurrentWork = useWeWorkStore((state) => state.completeCurrentWork);
  const returnCurrentWork = useWeWorkStore((state) => state.returnCurrentWork);
  const cancelWork = useWeWorkStore((state) => state.cancelWork);
  const [layout, setLayout] = useState<'list' | 'board'>('board');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const issues = teamIssues(team).filter((work) => !normalizedQuery || [work.title, work.goal, work.status, work.priority, work.category].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  const assignee = (work: WorkItem) => team.employees.find((employee) => employee.id === work.assignedEmployeeId);
  const priorityControl = (work: WorkItem) => <select aria-label={`修改 ${work.title} 优先级`} value={work.priority} onChange={(event) => void updateWorkItem(work.id, { priority: event.target.value as WorkItem['priority'] })} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-500"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>;
  const changeStatus = (work: WorkItem, status: WorkItem['status']) => {
    const employee = assignee(work);
    if (status === 'completed' && employee?.currentWorkItem?.id === work.id) completeCurrentWork(employee.id);
    else if (status === 'pending' && employee?.currentWorkItem?.id === work.id) returnCurrentWork(employee.id);
    else if (status === 'blocked' && work.status !== 'completed') void cancelWork(work.id);
  };
  // @ts-expect-error employee is retained for the assignee-aware card controls.
  const card = (work: WorkItem) => { const employee = assignee(work); const meta = issueTone[work.status]; return <article key={work.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300"><div className="flex items-center gap-2"><Circle className={`h-3 w-3 fill-current ${meta.dot.replace('bg-', 'text-')}`} /><span className="text-[9px] font-semibold uppercase text-slate-400">{work.id.slice(-6)}</span><select aria-label={`修改 ${work.title} 类型`} value={work.category} onChange={(event) => void updateWorkItem(work.id, { category: event.target.value as WorkItem['category'] })} className="ml-auto rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500"><option value="Paperwork">公文</option><option value="Digital">任务</option></select></div><h5 className="mt-2 text-[11px] font-semibold leading-5 text-slate-800">{work.title}</h5><div className="mt-3 flex gap-2">{priorityControl(work)}<select aria-label={`修改 ${work.title} 状态`} value={work.status} onChange={(event) => changeStatus(work, event.target.value as WorkItem['status'])} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-500"><option value="pending">Backlog</option><option value="running" disabled={!work.assignedEmployeeId}>In progress</option><option value="blocked">Blocked</option><option value="completed" disabled={!work.assignedEmployeeId}>Done</option></select></div><select aria-label={`修改 ${work.title} 负责人`} value={work.assignedEmployeeId ?? ''} disabled={work.status !== 'pending'} onChange={(event) => { if (event.target.value) dispatchWorkToEmployee(work.id, event.target.value); }} className="mt-2 w-full rounded border border-slate-200 bg-white px-1 py-1 text-[10px] text-slate-500 disabled:bg-slate-50"><option value="">未指派</option>{team.employees.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}</select></article>; };
  return <div><div className="mb-4 flex items-center justify-between"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input aria-label="筛选 Issues" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选 Issues…" className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[11px] outline-none focus:border-slate-300" /></div><div className="flex rounded-lg border border-slate-200 bg-white p-1"><button type="button" aria-label="列表视图" onClick={() => setLayout('list')} className={`grid h-7 w-8 place-items-center rounded ${layout === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`}><LayoutList className="h-4 w-4" /></button><button type="button" aria-label="看板视图" onClick={() => setLayout('board')} className={`grid h-7 w-8 place-items-center rounded ${layout === 'board' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`}><Columns3 className="h-4 w-4" /></button></div></div>{layout === 'board' ? <div className="grid grid-cols-4 gap-3">{(['pending','running','blocked','completed'] as WorkItem['status'][]).map((status) => <section key={status} className="min-h-[520px] rounded-xl bg-slate-100/70 p-3"><div className="mb-3 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${issueTone[status].dot}`} /><h4 className="text-[11px] font-bold text-slate-700">{issueTone[status].label}</h4><span className="ml-auto text-[10px] text-slate-400">{issues.filter((work) => work.status === status).length}</span></div><div className="space-y-2">{issues.filter((work) => work.status === status).map(card)}</div></section>)}</div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="grid grid-cols-[90px_minmax(0,1fr)_130px_100px] border-b border-slate-100 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400"><span>Status</span><span>Issue</span><span>Assignee</span><span>Priority</span></div>{issues.map((work) => { const employee = assignee(work); return <article key={work.id} className="grid grid-cols-[90px_minmax(0,1fr)_130px_100px] items-center border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"><span className="flex items-center gap-2 text-[10px] text-slate-500"><i className={`h-2 w-2 rounded-full ${issueTone[work.status].dot}`} />{issueTone[work.status].label}</span><span className="truncate text-[11px] font-semibold text-slate-800">{work.title}</span><span className="text-[10px] text-slate-500">{employee?.displayName ?? 'Unassigned'}</span><span className={`text-[10px] ${work.priority === 'high' ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{work.priority}</span></article>; })}</div>}</div>;
}

function TeamSettingsView({ team }: { team: WeWorkTeam }) {
  const updateTeamWorkspace = useWeWorkStore((state) => state.updateTeamWorkspace);
  const archiveTeam = useWeWorkStore((state) => state.archiveTeam);
  const configureTeamModules = useWeWorkStore((state) => state.configureTeamModules);
  const deleteProjectData = useWeWorkStore((state) => state.deleteProjectData);
  const module = team.modules?.projectManagement ?? { installed: false, enabled: false, capabilities: [] as ProjectCapability[] };
  const configure = (patch: Partial<typeof module>) => configureTeamModules(team.id, { projectManagement: { ...module, ...patch } });
  const [weworkRoot, setWeWorkRoot] = useState('Documents/WeWork');
  const [configRoot, setConfigRoot] = useState('Documents/.wework');
  const persistedPath = team.workspaceAssignment?.kind === 'local' ? team.workspaceAssignment.rootPath ?? '' : '';
  const [localPath, setLocalPath] = useState(persistedPath || `Documents/WeWork/${team.id}`);
  const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    setLocalPath(persistedPath || `${weworkRoot.replace(/[\\/]$/, '')}/${team.id}`);
    setMessage('');
  }, [team.id, persistedPath]);
  useEffect(() => {
    void weworkHost.dataInfo().then((info) => {
      setWeWorkRoot(info.rootPath);
      setConfigRoot(info.configPath);
      if (!persistedPath) setLocalPath(`${info.rootPath.replace(/[\\/]$/, '')}/${team.id}`);
    }).catch(() => {});
  }, [team.id, persistedPath]);
  const choose = async () => {
    if (choosing) return;
    setChoosing(true); setMessage('');
    try { const selected = await weworkHost.chooseLocalWorkspace(); if (selected) setLocalPath(selected.rootPath); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setChoosing(false); }
  };
  const valid = Boolean(localPath.trim());
  const save = async () => { setSaving(true); setMessage(''); try { const normalized = normalizeWorkspaceAssignment({ kind: 'local', rootPath: localPath.trim() }); await updateTeamWorkspace(team.id, normalized); setMessage('团队 Workspace 已保存'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); } };
  const defaultTeamPath = `${weworkRoot.replace(/[\\/]$/, '')}/${team.id}`;
  const effectiveTeamPath = localPath.trim() || defaultTeamPath;
  const defaultEmployeePath = `${effectiveTeamPath}/employees/<employee-id>`;
  return <div className="mx-auto max-w-3xl space-y-5 pb-8">
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-slate-900">Project Management 模块</h3><p className="mt-1 text-xs leading-5 text-slate-500">按团队安装和启用；停用保留 Collaboration Database，重新启用即可恢复。</p></div><button type="button" onClick={() => void configure(module.installed ? { enabled: !module.enabled } : { installed: true, enabled: true })} className={`rounded-lg px-3 py-2 text-xs font-semibold ${module.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>{module.enabled ? '停用模块' : module.installed ? '启用模块' : '安装并启用'}</button></div>{module.installed && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{PROJECT_CAPABILITIES.map((capability) => <label key={capability} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"><input type="checkbox" disabled={!module.enabled} checked={module.capabilities.includes(capability)} onChange={(event) => void configure({ capabilities: event.target.checked ? [...module.capabilities, capability] : module.capabilities.filter((item) => item !== capability) })} />{capability}</label>)}</div>}{team.collaborationDatabase && <div className="mt-4 border-t border-slate-100 pt-4"><button type="button" className="text-xs font-semibold text-rose-600" onClick={() => { if (window.confirm('永久删除该团队的 Collaboration Database？模块停用不会删除数据，此操作不可撤销。')) void deleteProjectData(team.id); }}>独立删除项目数据…</button></div>}</section>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">团队 Workspace</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">团队计划、群聊、上下文、Workflow、共享 Skill 与成员目录都归属于团队 Workspace。</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sky-600 shadow-sm"><FolderGit2 className="h-4 w-4" /></span><div className="min-w-0"><strong className="block truncate text-xs text-slate-800">{team.name}</strong><span className="text-[10px] text-slate-400">团队 ID · {team.id}</span></div></div>
        <div className="mt-3 flex gap-2"><input aria-label="团队 Workspace 路径" value={localPath} onChange={(event) => { setLocalPath(event.target.value); setMessage(''); }} placeholder={defaultTeamPath} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400" /><button type="button" disabled={choosing} onClick={() => void choose()} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:opacity-50">{choosing ? '选择中…' : '选择目录'}</button></div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-3">{message && <span role="status" className="mr-auto text-xs text-slate-500">{message}</span>}<button type="button" disabled={saving || !valid} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving ? '保存中…' : '保存团队 Workspace'}</button></div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-slate-900">配置与 Prompt 继承</h3><div className="mt-4 grid gap-2 text-xs text-slate-600"><p className="rounded-lg bg-slate-50 px-3 py-2">设备默认：{configRoot}/config.json + {configRoot}/WEWORK.md</p><p className="rounded-lg bg-slate-50 px-3 py-2">团队覆盖：{effectiveTeamPath}/.wework/config.json + {effectiveTeamPath}/WEWORK.md</p><p className="rounded-lg bg-slate-50 px-3 py-2">助手覆盖：{defaultEmployeePath}/.wework/config.json + {defaultEmployeePath}/WEWORK.md</p><p className="mt-1 text-[11px] leading-5 text-slate-400">助手目录始终位于该团队 Workspace 的 employees/&lt;employee-id&gt; 下。密码、SSH Key 与模型 Key 不写入这些文件，只保存 credentialRef。</p></div></section>
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5"><h3 className="text-sm font-bold text-slate-900">团队归档</h3><p className="mt-1 text-xs leading-5 text-slate-500">归档会从活动团队列表隐藏该团队，但保留任务、聊天、交付、审计记录和 Workspace。之后可从侧边栏恢复或永久删除。</p><button type="button" onClick={() => { if (window.confirm(`归档团队“${team.name}”？`)) void archiveTeam(team.id); }} className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50">归档团队</button></section>
  </div>;
}

export function TeamManagementView() {
  const { teams, selectedTeamId, setAddEmployeeOpen, openWorkbench, removeEmployee, setTeamLead, serviceError } = useWeWorkStore();
  const [section, setSection] = useState<'members' | 'chat' | 'settings'>('members');
  const [configEmployeeId, setConfigEmployeeId] = useState<string | null>(null);
  const team = teams.find((item) => item.id === selectedTeamId);
  if (!team) return null;
  const configEmployee = team.employees.find((employee) => employee.id === configEmployeeId);

  return <section className="h-full overflow-hidden bg-slate-50 px-8 py-5"><div className="mx-auto flex h-full max-w-6xl flex-col">
    <div className="mb-5 flex min-h-11 shrink-0 items-end justify-between border-b border-slate-200">
      <nav aria-label="团队管理功能" className="flex self-stretch">{([{ id: 'members', label: '成员职责', icon: UserRound }, { id: 'chat', label: '团队群聊', icon: MessageCircle }, { id: 'settings', label: '团队设置', icon: Settings2 }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={`relative flex h-11 items-center gap-1.5 px-4 text-[11px] font-semibold transition-colors after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:rounded-full after:transition-colors ${section === id ? 'text-slate-900 after:bg-slate-900' : 'text-slate-400 after:bg-transparent hover:text-slate-700'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>
      {section === 'members' && <div className="mb-2 flex gap-2"><button onClick={() => setAddEmployeeOpen(true)} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />助手入职</button></div>}
    </div>
    {serviceError && <div role="alert" className="mb-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800"><strong className="mr-2">操作未完成</strong>{serviceError.includes('runtime profile') ? '该助手尚未绑定可用的执行配置，请从左下角“执行器与模型”创建配置后再为助手绑定。' : serviceError}</div>}
    <div className={`min-h-0 flex-1 ${section === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{section === 'members' ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{team.employees.map((employee) => <article key={employee.id} className="min-h-36 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: employee.color }}><UserRound className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{employee.isLead ? '负责人' : employee.status === 'working' ? '工作中' : '在席'}</span></div>
      <strong className="mt-3 block text-sm text-slate-900">{employee.displayName}</strong><span className="mt-1 block text-xs text-slate-500">{employee.roleName}</span><span className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><Wrench className="h-3.5 w-3.5" />{employee.builtInSkills.length} 项技能 · {employee.activeSession.contextRatio}% 上下文</span>
      <div className="mt-4 flex gap-1.5 border-t border-slate-100 pt-3"><button type="button" onClick={() => openWorkbench(employee.id)} className="mr-auto rounded-md px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100">打开工作台</button><button type="button" aria-label={`配置助手 ${employee.displayName}`} onClick={() => setConfigEmployeeId(employee.id)} className="flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100" title="助手配置"><Settings2 className="h-3.5 w-3.5" />助手配置</button>{!employee.isLead && <button type="button" aria-label={`设 ${employee.displayName} 为负责人`} onClick={() => setTeamLead(team.id, employee.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="设为负责人"><Crown className="h-3.5 w-3.5" /></button>}{!employee.isLead && <button type="button" aria-label={`移除 ${employee.displayName}`} onClick={() => removeEmployee(team.id, employee.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="移出团队"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    </article>)}</div> : section === 'chat' ? <TeamChatView team={team} /> : <TeamSettingsView team={team} />}</div>
  </div>{configEmployee && <EmployeeConfigDialog employee={configEmployee} team={team} onClose={() => setConfigEmployeeId(null)} />}</section>;
}
