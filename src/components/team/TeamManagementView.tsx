import { localWeWorkApi } from '../../api/weworkApi';
import { EMPLOYEE_COLORS, randomEmployeeColor } from '../../domain/employeeColor';
import { Dialog, Button, Input, NativeSelect, Textarea } from '../ui';
import { WeWorkEmployeeAvatar } from '../WeWorkEmployeeAvatar';
import { SessionContextSummary } from '../workbench/SessionContextSummary';
import { completeGroupMention, groupMentionSuggestions, parseGroupDraft } from './groupDraft';
import { GroupMentionList } from './GroupMentionList';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, BriefcaseBusiness, Circle, Columns3, Crown, FolderGit2, LayoutList, MessageCircle, Plus, RotateCcw, Search, Settings2, Trash2, UserRound, Wrench, X } from 'lucide-react';
import { normalizeWorkspaceAssignment, type AgentPermissionMode, type WeWorkEmployee, type WeWorkTeam, type SessionExecution, type SkillRef, type WorkItem, type WorkspaceAssignment } from '../../domain/wework';
import { agentPermissionOptions } from '../../domain/agentPermissions';
import { useWeWorkStore } from '../../state/weworkStore';
import { weworkHost, type AvailableSkill, type HarnessId, type HarnessInstallation, type HarnessModel } from '../../runtime/weworkHost';
import { executionWithCatalogModel, migrateLegacyCatalogSelection } from './workspaceDraft';
import { PLANE_PLUGIN_ID, PROJECT_CAPABILITIES, type ProjectCapability } from '../../domain/collaboration';
import { performancePages, servicePages, type PortalPage } from '../../domain/portalNavigation';
import { PortalPageView } from '../portal/PortalPageView';
import { ConversationComposer } from '../common/ConversationComposer';
import { MarkdownMessage } from '../common/MarkdownMessage';

const adapterHarness = (adapter: SessionExecution['adapter']): HarnessId => adapter === 'smalldash' ? 'smalldashharness' : adapter;
const harnessAdapter = (harness: HarnessId): SessionExecution['adapter'] => harness === 'smalldashharness' ? 'smalldash' : harness;

export function EmployeeConfigDialog({ employee, team, onClose, embedded = false }: { employee: WeWorkEmployee; team?: WeWorkTeam; onClose: () => void; embedded?: boolean }) {
  const { updateEmployee, resetEmployeeContext, teams } = useWeWorkStore();
  const owningTeam = team ?? teams.find((candidate) => candidate.employees.some((employee) => employee.id === employee.id));
  const [color, setColor] = useState(employee.color);
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [roleName, setRoleName] = useState(employee.roleName);
  const [runtime, setRuntime] = useState<WeWorkEmployee['runtime']>(employee.runtime);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState(employee.builtInSkills.map((skill) => skill.id));
  const [skillMessage, setSkillMessage] = useState('正在读取 Skill Pool…');
  const [contextTags, setContextTags] = useState((employee.activeSession.contextTagIds ?? []).join(', '));
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(employee.activeSession.permissionMode ?? 'auto');
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
    setPermissionMode(employee.activeSession.permissionMode ?? 'auto');
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
      await updateEmployee(employee.id, { color, displayName: displayName.trim(), roleName: roleName.trim(), runtime, skills, defaultRuntimeProfileId: defaultRuntimeProfileId || undefined, workspaceAssignment, sessionExecution: executionChanged ? nextExecution : undefined, sessionContextTagIds, sessionPermissionMode: permissionMode, startNewSession });
      onClose();
    } catch (error) {
      setHostMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  const resetContext = async () => {
    if (!window.confirm(`确定清空 ${employee.displayName} 的当前上下文吗？旧对话会保留为只读历史，助手将重新开始。`)) return;
    setSaving(true); setHostMessage(''); try { await resetEmployeeContext(employee.id); setHostMessage('已创建空白会话，上下文已清空'); } catch(error) { setHostMessage(error instanceof Error?error.message:String(error)); } finally { setSaving(false); }
  };
  const workspaceValid = Boolean(localRootPath.trim());
  const sessionValid = JSON.stringify(sessionExecution) === JSON.stringify(initialExecution) || Boolean(sessionExecution.name.trim() && (selectedHarness !== 'smalldashharness'
    ? sessionExecution.model.modelId
    : sessionExecution.modelCatalogId && selectableModels.some((model) => model.id === sessionExecution.modelCatalogId)));
  const employeeConfigurationValid = !window.weworkHost || sessionValid;
  const showHostError = (error: unknown) => setHostMessage(error instanceof Error && error.message.includes('WeWork desktop host') ? '此功能需要 WeWork Desktop Host' : error instanceof Error ? error.message : String(error));
  const chooseWorkspace = async () => { if (choosingWorkspace) return; setChoosingWorkspace(true); setHostMessage(''); try { const workspace = await weworkHost.chooseLocalWorkspace(); if (workspace) { setLocalRootPath(workspace.rootPath); setHostMessage(`已选择：${workspace.rootPath}`); } } catch (error) { showHostError(error); } finally { setChoosingWorkspace(false); } };

  return <div className={embedded ? 'h-full min-h-0' : 'fixed inset-0 z-[100] grid place-items-center bg-slate-900/20 p-8 backdrop-blur-[2px]'} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) onClose(); }}>
    <section role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={`配置 ${employee.displayName}`} className={embedded ? 'flex h-full min-h-0 flex-col overflow-hidden bg-white' : 'flex max-h-[calc(100vh-64px)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'}>
      {!embedded && <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h3 className="text-base font-bold text-slate-900">助手配置</h3><p className="mt-1 text-xs text-slate-400">管理角色、运行环境、技能与当前上下文</p></div><Button variant="ghost" type="button" aria-label="关闭助手配置" onClick={onClose} className="grid h-8 w-8 place-items-center"><X className="h-4 w-4" /></Button></header>}
      <div className="employee-config-fields min-h-0 flex-1 grid grid-cols-2 content-start gap-3 overflow-y-auto overscroll-contain p-4">
        <section className="col-span-2" aria-label="助手配色"><div className="flex items-center gap-3"><span className="h-12 w-12 shrink-0"><WeWorkEmployeeAvatar employee={{...employee,color}} overview/></span><div className="min-w-0 flex-1"><strong className="text-xs text-slate-700">头像颜色</strong><div className="mt-2 flex flex-wrap items-center gap-2">{EMPLOYEE_COLORS.map(value=><button key={value} type="button" aria-label={`选择颜色 ${value}`} aria-pressed={color.toLowerCase()===value.toLowerCase()} onClick={()=>setColor(value)} style={{backgroundColor:value}} className={`h-5 w-5 rounded-full border-2 border-white outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${color.toLowerCase()===value.toLowerCase()?'ring-2 ring-slate-700 ring-offset-1':''}`}/>)}<input type="color" aria-label="自定义助手颜色" value={color} onChange={event=>setColor(event.target.value)} className="h-7 w-8 cursor-pointer rounded border border-slate-200 p-0"/><button type="button" onClick={()=>setColor(randomEmployeeColor([color]))} className="text-[11px] text-sky-700">随机换色</button></div></div></div></section>
        <label className="text-xs font-semibold text-slate-600">助手名称<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full px-3 py-2.5 outline-none" /></label>
        <label className="text-xs font-semibold text-slate-600">角色 / 职责<Input value={roleName} onChange={(event) => setRoleName(event.target.value)} className="mt-2 w-full px-3 py-2.5 outline-none" /></label>

        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="Session 执行设置">
          <div><strong className="block text-xs text-slate-700">执行模型</strong><span className="mt-0.5 block text-[11px] text-slate-400">选择这名助手使用的执行器与模型。</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-semibold text-slate-600">Harness<NativeSelect aria-label="Session Harness" value={selectedHarness} onChange={(event) => { const nextHarness = event.target.value as HarnessId; const candidates = harnessModels.filter((model) => model.harness === nextHarness); const selected = candidates.find((model) => model.id === defaultHarnessModels[nextHarness]) ?? candidates[0]; setSessionExecution(selected ? executionWithCatalogModel(sessionExecution, selected) : { ...sessionExecution, adapter: harnessAdapter(nextHarness), modelCatalogId: undefined, model: nextHarness === 'smalldashharness' ? { provider: '', modelId: '' } : { provider: nextHarness, modelId: 'default' } }); setRuntime(nextHarness === 'pi' ? 'Pi' : nextHarness === 'claude-code' ? 'Claude Code' : nextHarness === 'smalldashharness' ? 'DSH' : 'Workspace'); }} className="mt-2 w-full px-3 py-2.5">{!availableHarnesses.some(item=>item.harness===selectedHarness)&&<option value={selectedHarness}>{selectedHarness}（当前配置）</option>}{availableHarnesses.map((item) => <option key={item.id} value={item.harness}>{item.harness === 'smalldashharness' ? 'smalldashharness（远程）' : item.harness}</option>)}</NativeSelect>{sessionHasContext && (!initialExecution || initialExecution.adapter !== sessionExecution.adapter) && <span className="mt-1.5 block text-[11px] font-normal leading-4 text-amber-600">保存后将开启新 Session，旧 Harness 上下文不会混入。</span>}</label>

            <label className="col-span-2 text-xs font-semibold text-slate-600">模型<NativeSelect aria-label="Session 模型" value={sessionExecution.modelCatalogId ?? (sessionExecution.model.modelId && sessionExecution.model.modelId!=='default'?'__current':'')} onChange={(event) => { if(event.target.value==='__current')return; const selected = selectableModels.find((model) => model.id === event.target.value); if (selected) setSessionExecution(executionWithCatalogModel(sessionExecution, selected)); else if (selectedHarness !== 'smalldashharness') setSessionExecution({ ...sessionExecution, modelCatalogId: undefined, model: { provider: selectedHarness, modelId: 'default' } }); }} className="mt-2 w-full px-3 py-2.5">{!sessionExecution.modelCatalogId&&sessionExecution.model.modelId&&sessionExecution.model.modelId!=='default'&&<option value="__current">{sessionExecution.model.modelId}（当前配置）</option>}<option value="">{selectedHarness === 'smalldashharness' ? '选择已验证模型' : '跟随 Harness 默认模型'}</option>{selectableModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}/{model.modelId}{model.id === defaultHarnessModels[selectedHarness] ? '（当前默认）' : ''}</option>)}</NativeSelect></label>
            {selectedHarness === 'smalldashharness' ? (selectableModels.length ? <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">SDH 的模型连接由 WeWork 管理；同一 Session 内切换模型时继续使用 SDH 的原生上下文与 compaction。</p> : <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">SDH 尚无已验证模型，请先在“执行器与模型”中添加并验证。</p>) : <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">登录和模型连接在 {selectedHarness} 中管理。</p>}
            <details className="col-span-2"><summary className="cursor-pointer text-[11px] text-slate-500">高级：配置名称</summary><label className="block text-xs font-semibold text-slate-600">配置名称<Input value={sessionExecution.name} onChange={(event) => setSessionExecution({ ...sessionExecution, name: event.target.value })} className="mt-2 w-full px-3 py-2.5" /></label></details>
          </div>
        </section>        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="Workspace 设置">
          <div className="flex items-center gap-2"><FolderGit2 className="h-4 w-4 text-slate-500" /><div><strong className="block text-xs text-slate-700">Workspace</strong><span className="text-[11px] text-slate-400">该助手执行任务时使用的唯一目录</span></div></div>
          <div className="mt-4 flex gap-2"><Input aria-label="助手 Workspace 路径" value={localRootPath} onChange={(event) => { setLocalRootPath(event.target.value); setHostMessage(''); }} placeholder={employeeDefaultPath} className="min-w-0 flex-1 px-3 py-2.5 outline-none" /><Button variant="secondary" type="button" disabled={choosingWorkspace} onClick={() => void chooseWorkspace()} className="shrink-0 px-3 text-[11px]">{choosingWorkspace ? '选择中…' : '选择目录'}</Button></div>
          {hostMessage && <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{hostMessage}</p>}
        </section>

        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="Agent 权限">
          <div><strong className="block text-xs text-slate-700">Agent 权限</strong><span className="mt-0.5 block text-[11px] text-slate-400">控制当前 Session 能看到和调用哪些 WeWork 工具。</span></div>
          <div className="mt-3 space-y-2">{agentPermissionOptions.map((option) => <label key={option.mode} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${permissionMode === option.mode ? option.mode === 'full' ? 'border-orange-300 bg-orange-50' : 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}><input type="radio" name={`permission-${employee.id}`} value={option.mode} checked={permissionMode === option.mode} onChange={() => setPermissionMode(option.mode)} className="mt-0.5 accent-sky-600"/><span><strong className={`block text-xs ${option.tone}`}>{option.label}</strong><span className="mt-1 block text-[11px] leading-4 text-slate-500">{option.description}</span></span></label>)}</div>
          <p className="mt-3 text-[11px] leading-4 text-slate-400">权限变更在下一次执行生效；运行中的任务不会中途获得更多权限。</p>
        </section>

        <section className="col-span-2 rounded-xl border border-slate-200 p-4" aria-label="助手 Skills 与 Persona"><div className="flex items-start justify-between gap-3"><div><strong className="block text-xs text-slate-700">Skills 与 Persona</strong><span className="mt-0.5 block text-[11px] text-slate-400">从 WeWork 业务技能与当前 Workspace 的 Skill Pool 绑定真实技能包。</span></div><Button type="button" onClick={() => void loadSkills()} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-sky-300"><RotateCcw className="h-3 w-3" />重新扫描</Button></div><div className="mt-4 grid grid-cols-2 gap-4"><div className="col-span-2"><div className="grid grid-cols-2 gap-2">{availableSkills.map((skill) => <label key={skill.id} className={`flex cursor-pointer gap-2 rounded-lg border p-3 transition ${selectedSkillIds.includes(skill.id) ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><input type="checkbox" checked={selectedSkillIds.includes(skill.id)} onChange={(event) => setSelectedSkillIds((ids) => event.target.checked ? [...new Set([...ids, skill.id])] : ids.filter((id) => id !== skill.id))} className="mt-0.5 accent-sky-600" /><span className="min-w-0"><span className="flex items-center gap-2 text-xs font-semibold text-slate-700">{skill.name}<i className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] not-italic font-medium text-slate-500">{skill.source === 'wework' ? 'WeWork 业务技能' : '当前 Workspace'}</i></span><span className="mt-1 block text-[11px] leading-4 text-slate-400">{skill.description || skill.id}</span></span></label>)}{employee.builtInSkills.filter((skill) => !availableSkills.some((available) => available.id === skill.id)).map((skill) => <label key={skill.id} className="flex cursor-pointer gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><input type="checkbox" checked={selectedSkillIds.includes(skill.id)} onChange={(event) => setSelectedSkillIds((ids) => event.target.checked ? [...new Set([...ids, skill.id])] : ids.filter((id) => id !== skill.id))} className="mt-0.5 accent-amber-600" /><span><span className="text-xs font-semibold text-slate-700">{skill.name}</span><span className="mt-1 block text-[11px] text-amber-700">已绑定，但当前 Skill Pool 中不可用</span></span></label>)}</div>{skillMessage && <p role="status" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{skillMessage}。Workspace Skill 目录：skills/&lt;skill-id&gt;/SKILL.md</p>}</div><label className="col-span-2 text-xs font-semibold text-slate-600">Persona / Session 指令<Textarea value={sessionExecution.systemPrompt} onChange={(event) => setSessionExecution({ ...sessionExecution, systemPrompt: event.target.value })} placeholder="描述该助手在当前 Session 中应坚持的身份、视角和工作方式" className="mt-2 min-h-24 w-full resize-y px-3 py-2.5 leading-5" /></label></div></section>
        <section className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="上下文管理"><SessionContextSummary session={employee.activeSession}/><div className="mt-3 flex justify-end"><Button variant="secondary" type="button" disabled={saving} onClick={resetContext} className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] hover:border-rose-200 hover:text-rose-600"><RotateCcw className="h-3.5 w-3.5" />清空上下文</Button></div><label className="mt-4 block border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-600">订阅群聊上下文 Tag<Input aria-label="Session 上下文 Tag" value={contextTags} onChange={(event) => setContextTags(event.target.value)} placeholder="例如：项目事实, 质检（逗号分隔）" className="mt-2 w-full px-3 py-2 font-normal" /><span className="mt-1.5 block font-normal leading-4 text-slate-400">全员消息和直接 @ 你的消息始终可见；标签用于补充订阅其他相关群聊上下文。</span></label></section>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">{!embedded && <Button variant="ghost" type="button" onClick={onClose} className="px-4 py-2 text-xs">取消</Button>}<Button variant="primary" type="button" disabled={saving || !displayName.trim() || !roleName.trim() || !workspaceValid || !employeeConfigurationValid} onClick={save} className="px-5 py-2 text-xs">{saving ? '保存中…' : '保存配置'}</Button></footer>
    </section>
  </div>;
}

const issueTone: Record<WorkItem['status'], { label: string; dot: string }> = {
  pending: { label: 'Backlog', dot: 'bg-slate-400' }, running: { label: 'In progress', dot: 'bg-amber-500' }, completed: { label: 'Done', dot: 'bg-emerald-500' }, blocked: { label: 'Blocked', dot: 'bg-rose-500' },
};
function teamIssues(team: WeWorkTeam) {
  return [...team.pendingWorks, ...(team.completedWorks ?? []), ...team.employees.flatMap((employee) => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? [])].filter((work): work is WorkItem => Boolean(work)))].filter((work, index, all) => all.findIndex((item) => item.id === work.id) === index);
}

function GroupDeliveryFeedback({ team, onCancel }: { team: WeWorkTeam; onCancel: (id: string) => void }) {
  const deliveries = team.collaborationDeliveries ?? [];
  const active = deliveries.filter(item=>item.status === 'queued' || item.status === 'running');
  const history = deliveries.filter(item=>item.status !== 'queued' && item.status !== 'running');
  const labels = {queued:'排队中',running:'正在回复',failed:'执行失败',cancelled:'已取消',uncertain:'执行结果待核对',succeeded:'已回复'};
  const line = (item: typeof deliveries[number]) => <div key={item.id} className="py-1">{team.employees.find(employee=>employee.id===item.employeeId)?.displayName ?? '助手'} · {labels[item.status]}{item.error && item.status !== 'cancelled' ? `：${item.error}` : ''}{(item.status==='queued' || item.status==='running') && <button type="button" onClick={()=>onCancel(item.id)} className="ml-2 text-sky-700 underline">取消这次回复</button>}</div>;
  if(!deliveries.length) return null;
  return <div className="mb-2 rounded-lg bg-white/70 px-3 py-1 text-[11px] text-slate-500"><div role="status" className="max-h-24 overflow-auto">{active.length ? active.map(line) : line(history[history.length-1])}</div>{history.length > 1 && <details><summary className="cursor-pointer py-1 text-slate-400">历史执行记录（{history.length}）</summary><div className="max-h-28 overflow-auto">{history.slice(-10).reverse().map(line)}</div></details>}</div>;
}

function TeamChatView({ team }: { team: WeWorkTeam }) {
  const sendTeamMessage=useWeWorkStore(state=>state.sendTeamMessage);
  const cancelGroupDelivery=useWeWorkStore(state=>state.cancelGroupDelivery);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const [draft,setDraft]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const [messageQuery,setMessageQuery]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  const [sending,setSending]=useState(false);
  const [sendError,setSendError]=useState('');
  const parsed=parseGroupDraft(draft,team.employees);
  const [mentionIndex,setMentionIndex]=useState(0);
  const [mentionsDismissed,setMentionsDismissed]=useState(false);
  useEffect(()=>{setMentionIndex(0);setMentionsDismissed(false)},[draft]);
  const suggestions=mentionsDismissed?[]:groupMentionSuggestions(draft,team.employees);
  const tagQuery=draft.match(/(?:^|\s)#([\p{L}\p{N}_-]*)$/u)?.[1];
  const knownTags=[...new Set([...(team.teamMessages??[]).flatMap(message=>message.contextTagIds??[]),...team.employees.flatMap(employee=>employee.activeSession.contextTagIds??[])])];
  const tagSuggestions=tagQuery===undefined||mentionsDismissed?[]:[...knownTags.filter(tag=>tag.toLowerCase().includes(tagQuery.toLowerCase())),...(tagQuery&&!knownTags.includes(tagQuery)?[tagQuery]:[])];
  const selectedTag=Math.min(mentionIndex,Math.max(0,tagSuggestions.length-1));
  const completeTag=(tag:string)=>{setDraft(value=>value.replace(/#[\p{L}\p{N}_-]*$/u,`#${tag} `));inputRef.current?.focus()};
  const selectedMention=Math.min(mentionIndex,Math.max(0,suggestions.length-1));
  const latestRequest=(team.teamMessages??[]).filter(message=>message.recipientId).at(-1);
  const failedDeliveries=(team.collaborationDeliveries??[]).filter(delivery=>delivery.status==='failed'&&delivery.messageId===latestRequest?.id&&!team.collaborationDeliveries?.some(retry=>retry.retryOf===delivery.id));
  const messages=(team.teamMessages??[]).filter(message=>`${message.text} ${message.senderName??''}`.toLowerCase().includes(messageQuery.toLowerCase()));
  const active=(team.collaborationDeliveries??[]).filter(item=>item.status==='running'||item.status==='queued');
  const conversation=useConversationScroll(team.id+':'+messageQuery,team);
  useEffect(()=>{setDraft('');setMessageQuery('');setSearchOpen(false);setSendError('');setHistoryOpen(false)},[team.id]);
  const mention=(employee:Pick<WeWorkEmployee,'displayName'>)=>{setDraft(value=>completeGroupMention(value,employee.displayName));inputRef.current?.focus()};
  const submit=async()=>{
    if(!draft.trim()||sending)return;
    if(!parsed.all&&parsed.mentioned.length>1){setSendError('请一次 @ 一位助手；不带 @ 的消息全员可见。');return;}
    setSending(true);setSendError('');conversation.latest();
    try{await sendTeamMessage(team.id,draft.trim(),parsed.recipientId,parsed.contextTagIds);setDraft('')}
    catch(error){setSendError(error instanceof Error?error.message:String(error))}
    finally{setSending(false)}
  };
  const cancel=(id:string)=>void cancelGroupDelivery(team.id,id).catch(error=>setSendError(error.message));
  return <div className="relative grid h-full min-h-0 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[180px_minmax(0,1fr)]">
    <aside className="hidden overflow-auto border-r border-slate-100 bg-slate-50/50 p-4 lg:block"><h4 className="text-xs font-semibold">#{team.name}</h4><p className="mt-1 text-[11px] text-slate-400">{team.employees.length} 位 AI 助手 · 1 位人类</p><div className="mt-4 space-y-1"><div className="mb-2 flex items-center gap-2 rounded-lg p-2 text-xs"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><UserRound className="h-4 w-4"/></span><span>你</span><span className="ml-auto text-[11px] text-slate-400">人类</span></div>{team.employees.map(employee=><Button type="button" key={employee.id} onClick={()=>mention(employee)} aria-label={`提及 ${employee.displayName}`} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-sky-50"><span className="h-7 w-7 shrink-0"><WeWorkEmployeeAvatar employee={employee} overview/></span><span className="min-w-0 flex-1 truncate">{employee.displayName}</span>{active.some(item=>item.employeeId===employee.id)&&<span className="h-2 w-2 animate-pulse rounded-full bg-sky-500"/>}</Button>)}</div></aside>
    <section className="flex min-h-0 min-w-0 flex-col"><header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-5"><div><h4 className="text-xs font-bold">团队群聊</h4><p className="mt-1 text-[11px] text-slate-400">全员共享消息 · @ 助手邀请回复</p></div><div className="flex items-center gap-2"><Button variant="ghost" type="button" aria-label="执行记录" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(!historyOpen)} className="p-2 text-[11px]">执行记录</Button><button type="button" aria-label="搜索群聊" aria-expanded={searchOpen} onClick={()=>{setSearchOpen(!searchOpen);setMessageQuery('')}} className="p-2 text-slate-400"><Search className="h-4 w-4"/></button></div></header>
    {historyOpen&&<aside aria-label="群聊执行记录" className="max-h-48 shrink-0 overflow-auto border-b border-slate-100 bg-slate-50 p-3">{team.collaborationDeliveries?.length?<GroupDeliveryFeedback team={team} onCancel={cancel}/>:<p className="text-xs text-slate-400">暂无执行记录</p>}</aside>}
    {searchOpen&&<Input autoFocus type="search" aria-label="搜索群聊消息" value={messageQuery} onChange={e=>setMessageQuery(e.target.value)} placeholder="搜索消息或发送人" className="m-3 p-2"/>}
    <div ref={conversation.ref} onScroll={conversation.onScroll} aria-label="团队群聊消息" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{messages.length===0&&<p role="status" className="text-center text-xs text-slate-400">{messageQuery?'没有匹配的消息':'发送第一条消息，所有成员都可以看到。'}</p>}{messages.map(message=>{const human=message.sender==='user';const employee=human?undefined:team.employees.find(e=>e.id===message.senderId)??team.employees.find(e=>e.displayName===message.senderName);return <article key={message.id} className="flex gap-3" data-sender-kind={human?'human':'employee'}><span className={`grid h-8 w-8 shrink-0 place-items-center ${human?'rounded-full bg-slate-900 text-white':''}`}>{human?<UserRound aria-label="人类用户" className="h-4 w-4"/>:employee?<WeWorkEmployeeAvatar employee={employee} overview/>:<span className="text-xs">AI</span>}</span><div className="min-w-0"><div className="flex items-center gap-2"><strong className="text-[11px] text-slate-700">{human?'你':message.senderName??'助手'}</strong><span className={`rounded px-1.5 py-0.5 text-[11px] ${human?'bg-slate-100 text-slate-500':'bg-sky-50 text-sky-700'}`}>{human?'人类':'AI 助手'}</span><time className="text-[11px] text-slate-400">{message.time.includes('T')?new Date(message.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):message.time}</time></div><div className="mt-1 text-xs leading-5 text-slate-600"><MarkdownMessage>{message.text}</MarkdownMessage></div></div></article>})}

    {!messageQuery&&active.map(item=><article key={item.id} className="flex items-center gap-3 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${item.status==='running'?'animate-pulse bg-sky-500':'bg-slate-300'}`}/><span>{team.employees.find(e=>e.id===item.employeeId)?.displayName} {item.status==='running'?'正在回复…':'等待当前执行结束…'}</span><button type="button" aria-label="取消这次回复" onClick={()=>cancel(item.id)} className="ml-auto text-[11px] hover:text-rose-600">取消</button></article>)}</div>
    {conversation.away&&<button type="button" onClick={conversation.latest} className="shrink-0 bg-sky-50 py-2 text-xs text-sky-700">回到最新消息 ↓</button>}{sendError&&<p role="alert" className="mx-4 text-xs text-rose-600">{sendError}</p>}
    {failedDeliveries.map(latestDelivery=><div key={latestDelivery.id} role="alert" className="mx-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700"><p>{team.employees.find(e=>e.id===latestDelivery.employeeId)?.displayName} 回复失败：{latestDelivery.error}</p><Button disabled={sending} onClick={async()=>{setSending(true);try{await localWeWorkApi.retryGroupDelivery(team.id,{deliveryId:latestDelivery.id,requestId:crypto.randomUUID()});await useWeWorkStore.getState().hydrate();}catch(error){setSendError(error instanceof Error?error.message:String(error));}finally{setSending(false)}}}>重试这次回复</Button></div>)}
    <GroupMentionList employees={team.employees} suggestions={suggestions} selectedIndex={selectedMention} onSelect={mention} className="mx-4"/>
    {tagQuery!==undefined&&!mentionsDismissed&&!tagSuggestions.length&&<p role="status" className="mx-4 text-xs text-slate-500">暂无已有标签，输入标签名称后按 Tab 或 Enter 创建。</p>}
    {tagSuggestions.length>0&&<div role="listbox" aria-label="上下文标签" className="mx-4 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">{tagSuggestions.map((tag,index)=><button key={tag} type="button" role="option" aria-selected={index===selectedTag} onMouseDown={e=>e.preventDefault()} onClick={()=>completeTag(tag)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${index===selectedTag?'bg-sky-50 text-sky-700':''}`}>#{tag}{!knownTags.includes(tag)&&' · 新标签'}</button>)}</div>}
    <ConversationComposer onInputKeyDown={event=>{
      const count=tagSuggestions.length||suggestions.length;
      const selected=tagSuggestions.length?selectedTag:selectedMention;
      if(!count)return;
      if(['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(event.key)&&!event.shiftKey){
        event.preventDefault();event.stopPropagation();
        if(event.key==='Escape')setMentionsDismissed(true);
        else if(event.key==='Tab'||event.key==='Enter'){if(tagSuggestions.length)completeTag(tagSuggestions[selectedTag]);else mention(suggestions[selectedMention]);}
        else setMentionIndex((selected+(event.key==='ArrowDown'?1:-1)+count)%count);
      }
    }} inputRef={inputRef} value={draft} onChange={setDraft} onSubmit={submit} disabled={sending} ariaLabel="发送团队消息" placeholder="发送消息… @ 提及助手，# 添加标签" leadingControls={<div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="提及群聊助手" onClick={()=>{setDraft(value=>`${value}${value&&!value.endsWith(' ')?' ':''}@`);inputRef.current?.focus()}} className="grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold text-slate-500 hover:bg-white">@</button><span className="text-[11px] text-slate-500">{parsed.all?'邀请全体助手回复':parsed.recipientId?`邀请 ${parsed.mentioned[0].displayName} 回复`:`#${team.name} · 全员可见`}</span>{parsed.contextTagIds.map(tag=><span key={tag} className="rounded-md bg-sky-50 px-1.5 py-1 text-[11px] text-sky-700">#{tag}</span>)}</div>}/></section></div>;
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
  const priorityControl = (work: WorkItem) => <NativeSelect aria-label={`修改 ${work.title} 优先级`} value={work.priority} onChange={(event) => void updateWorkItem(work.id, { priority: event.target.value as WorkItem['priority'] })} className="rounded px-1 py-0.5 text-[11px]"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></NativeSelect>;
  const changeStatus = (work: WorkItem, status: WorkItem['status']) => {
    const employee = assignee(work);
    if (status === 'completed' && employee?.currentWorkItem?.id === work.id) completeCurrentWork(employee.id);
    else if (status === 'pending' && employee?.currentWorkItem?.id === work.id) returnCurrentWork(employee.id);
    else if (status === 'blocked' && work.status !== 'completed') void cancelWork(work.id);
  };
  // @ts-expect-error employee is retained for the assignee-aware card controls.
  const card = (work: WorkItem) => { const employee = assignee(work); const meta = issueTone[work.status]; return <article key={work.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300"><div className="flex items-center gap-2"><Circle className={`h-3 w-3 fill-current ${meta.dot.replace('bg-', 'text-')}`} /><span className="text-[11px] font-semibold uppercase text-slate-400">{work.id.slice(-6)}</span><NativeSelect aria-label={`修改 ${work.title} 类型`} value={work.category} onChange={(event) => void updateWorkItem(work.id, { category: event.target.value as WorkItem['category'] })} className="ml-auto rounded bg-slate-100 px-1 py-0.5 text-[11px]"><option value="Paperwork">公文</option><option value="Digital">任务</option></NativeSelect></div><h5 className="mt-2 text-[11px] font-semibold leading-5 text-slate-800">{work.title}</h5><div className="mt-3 flex gap-2">{priorityControl(work)}<NativeSelect aria-label={`修改 ${work.title} 状态`} value={work.status} onChange={(event) => changeStatus(work, event.target.value as WorkItem['status'])} className="min-w-0 flex-1 rounded px-1 py-0.5 text-[11px]"><option value="pending">Backlog</option><option value="running" disabled={!work.assignedEmployeeId}>In progress</option><option value="blocked">Blocked</option><option value="completed" disabled={!work.assignedEmployeeId}>Done</option></NativeSelect></div><NativeSelect aria-label={`修改 ${work.title} 负责人`} value={work.assignedEmployeeId ?? ''} disabled={work.status !== 'pending'} onChange={(event) => { if (event.target.value) dispatchWorkToEmployee(work.id, event.target.value); }} className="mt-2 w-full rounded px-1 py-1 text-[11px] disabled:bg-slate-50"><option value="">未指派</option>{team.employees.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}</NativeSelect></article>; };
  return <div><div className="mb-4 flex items-center justify-between"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input aria-label="筛选 Issues" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选 Issues…" className="h-9 w-64 pl-9 pr-3 text-[11px] outline-none" /></div><div className="flex rounded-lg border border-slate-200 bg-white p-1"><button type="button" aria-label="列表视图" onClick={() => setLayout('list')} className={`grid h-7 w-8 place-items-center rounded ${layout === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`}><LayoutList className="h-4 w-4" /></button><button type="button" aria-label="看板视图" onClick={() => setLayout('board')} className={`grid h-7 w-8 place-items-center rounded ${layout === 'board' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`}><Columns3 className="h-4 w-4" /></button></div></div>{layout === 'board' ? <div className="grid grid-cols-4 gap-3">{(['pending','running','blocked','completed'] as WorkItem['status'][]).map((status) => <section key={status} className="min-h-[520px] rounded-xl bg-slate-100/70 p-3"><div className="mb-3 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${issueTone[status].dot}`} /><h4 className="text-[11px] font-bold text-slate-700">{issueTone[status].label}</h4><span className="ml-auto text-[11px] text-slate-400">{issues.filter((work) => work.status === status).length}</span></div><div className="space-y-2">{issues.filter((work) => work.status === status).map(card)}</div></section>)}</div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="grid grid-cols-[90px_minmax(0,1fr)_130px_100px] border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><span>Status</span><span>Issue</span><span>Assignee</span><span>Priority</span></div>{issues.map((work) => { const employee = assignee(work); return <article key={work.id} className="grid grid-cols-[90px_minmax(0,1fr)_130px_100px] items-center border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"><span className="flex items-center gap-2 text-[11px] text-slate-500"><i className={`h-2 w-2 rounded-full ${issueTone[work.status].dot}`} />{issueTone[work.status].label}</span><span className="truncate text-[11px] font-semibold text-slate-800">{work.title}</span><span className="text-[11px] text-slate-500">{employee?.displayName ?? 'Unassigned'}</span><span className={`text-[11px] ${work.priority === 'high' ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{work.priority}</span></article>; })}</div>}</div>;
}

function TeamSettingsView({ team }: { team: WeWorkTeam }) {
  const updateTeamWorkspace = useWeWorkStore((state) => state.updateTeamWorkspace);
  const archiveTeam = useWeWorkStore((state) => state.archiveTeam);
  const configureTeamModules = useWeWorkStore((state) => state.configureTeamModules);
  const deleteProjectData = useWeWorkStore((state) => state.deleteProjectData);
  const module = team.modules?.projectManagement ?? { installed: false, enabled: false, capabilities: [] as ProjectCapability[] };
  const planeInstallation = team.modules?.plugins?.[PLANE_PLUGIN_ID];
  const configure = (patch: Partial<typeof module>) => { const projectManagement={...module,...patch}; return configureTeamModules(team.id, { ...team.modules, projectManagement, plugins: { ...(team.modules?.plugins ?? {}), [PLANE_PLUGIN_ID]: { pluginId: PLANE_PLUGIN_ID, version: '0.1.0', enabled: projectManagement.enabled, permissions: ['project:read', 'project:write'], configuration: {} } } }); };
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
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold text-slate-900">项目管理</h3>{planeInstallation && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">内置 · v{planeInstallation.version}</span>}</div><p className="mt-1 text-xs leading-5 text-slate-500">直接使用当前团队的本地数据，无需部署服务或填写 URL。停用后保留工作项、看板与甘特图数据。</p></div><Button type="button" onClick={() => void configure(module.installed ? { enabled: !module.enabled } : { installed: true, enabled: true, capabilities: [...PROJECT_CAPABILITIES] })} className={`rounded-lg px-3 py-2 text-xs font-semibold ${module.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>{module.enabled ? '停用插件' : module.installed ? '启用插件' : '安装并启用'}</Button></div>{module.installed && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{PROJECT_CAPABILITIES.map((capability) => <label key={capability} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"><input type="checkbox" disabled={!module.enabled} checked={module.capabilities.includes(capability)} onChange={(event) => void configure({ capabilities: event.target.checked ? [...module.capabilities, capability] : module.capabilities.filter((item) => item !== capability) })} />{{ issues: '工作项', board: '看板', gantt: '甘特图', timeline: '时间线', calendar: '日历', database: '数据库', dag: '工作流' }[capability]}</label>)}</div>}{team.collaborationDatabase && <div className="mt-4 border-t border-slate-100 pt-4"><button type="button" className="text-xs font-semibold text-rose-600" onClick={() => { if (window.confirm('永久删除该团队的 Collaboration Database？插件停用不会删除数据，此操作不可撤销。')) void deleteProjectData(team.id); }}>删除插件数据…</button></div>}</section>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">团队 Workspace</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">团队计划、群聊、上下文、Workflow、共享 Skill 与成员目录都归属于团队 Workspace。</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sky-600 shadow-sm"><FolderGit2 className="h-4 w-4" /></span><div className="min-w-0"><strong className="block truncate text-xs text-slate-800">{team.name}</strong><span className="text-[11px] text-slate-400">团队 ID · {team.id}</span></div></div>
        <div className="mt-3 flex gap-2"><Input aria-label="团队 Workspace 路径" value={localPath} onChange={(event) => { setLocalPath(event.target.value); setMessage(''); }} placeholder={defaultTeamPath} className="min-w-0 flex-1 px-3 py-2 outline-none" /><Button variant="secondary" type="button" disabled={choosing} onClick={() => void choose()} className="shrink-0 px-3 text-xs">{choosing ? '选择中…' : '选择目录'}</Button></div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-3">{message && <span role="status" className="mr-auto text-xs text-slate-500">{message}</span>}<Button variant="primary" type="button" disabled={saving || !valid} onClick={() => void save()} className="px-4 py-2 text-xs">{saving ? '保存中…' : '保存团队 Workspace'}</Button></div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-slate-900">配置与 Prompt 继承</h3><div className="mt-4 grid gap-2 text-xs text-slate-600"><p className="rounded-lg bg-slate-50 px-3 py-2">设备默认：{configRoot}/config.json + {configRoot}/WEWORK.md</p><p className="rounded-lg bg-slate-50 px-3 py-2">团队覆盖：{effectiveTeamPath}/.wework/config.json + {effectiveTeamPath}/WEWORK.md</p><p className="rounded-lg bg-slate-50 px-3 py-2">助手覆盖：{defaultEmployeePath}/.wework/config.json + {defaultEmployeePath}/WEWORK.md</p><p className="mt-1 text-[11px] leading-5 text-slate-400">助手目录始终位于该团队 Workspace 的 employees/&lt;employee-id&gt; 下。密码、SSH Key 与模型 Key 不写入这些文件，只保存 credentialRef。</p></div></section>
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5"><h3 className="text-sm font-bold text-slate-900">团队归档</h3><p className="mt-1 text-xs leading-5 text-slate-500">归档会从活动团队列表隐藏该团队，但保留任务、聊天、交付、审计记录和 Workspace。之后可从侧边栏恢复或永久删除。</p><Button variant="secondary" type="button" onClick={() => { if (window.confirm(`归档团队“${team.name}”？`)) void archiveTeam(team.id); }} className="mt-4 border-amber-300 px-4 py-2 text-xs text-amber-700 hover:bg-amber-50">归档团队</Button></section>
  </div>;
}

export function TeamManagementView({ portalPage, onPortalNavigate, initialSection = 'members' }: { portalPage: PortalPage | null; onPortalNavigate: (page: PortalPage | null) => void; initialSection?: 'members' | 'chat' }) {
  const { teams, selectedTeamId, setAddEmployeeOpen, openWorkbench, removeEmployee, setTeamLead, serviceError, dismissError, isWorkbenchOpen } = useWeWorkStore();
  const [section, setSection] = useState<'members' | 'chat' | 'performance' | 'service' | 'settings'>(() => portalPage ? (performancePages.some((item) => item.id === portalPage) ? 'performance' : 'service') : initialSection);
  const [configEmployeeId, setConfigEmployeeId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const team = teams.find((item) => item.id === selectedTeamId);
  if (!team) return null;
  const configEmployee = team.employees.find((employee) => employee.id === configEmployeeId);

  return <section className="wework-team-management h-full overflow-hidden bg-slate-50 px-4 py-5 sm:px-8"><div className="mx-auto flex h-full max-w-6xl flex-col">
    <div className="mb-5 flex min-h-11 shrink-0 items-end justify-between border-b border-slate-200">
      <nav aria-label="团队管理功能" className="flex self-stretch">{([{ id: 'members', label: '成员职责', icon: UserRound }, { id: 'chat', label: '团队群聊', icon: MessageCircle }, { id: 'performance', label: '绩效考核', icon: BarChart3 }, { id: 'service', label: '服务受理', icon: BriefcaseBusiness }, { id: 'settings', label: '团队设置', icon: Settings2 }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => { setSection(id); if (id === 'performance') onPortalNavigate(portalPage && performancePages.some((item) => item.id === portalPage) ? portalPage : 'businessPerformance'); else if (id === 'service') onPortalNavigate(portalPage && servicePages.some((item) => item.id === portalPage) ? portalPage : 'businessBreakdown'); else onPortalNavigate(null); }} className={`relative flex h-11 items-center gap-1.5 px-4 text-[11px] font-semibold transition-colors after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:rounded-full after:transition-colors ${section === id ? 'text-slate-900 after:bg-slate-900' : 'text-slate-400 after:bg-transparent hover:text-slate-700'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>
      {section === 'members' && <div className="mb-2 flex gap-2"><Button variant="primary" onClick={() => setAddEmployeeOpen(true)} className="flex items-center gap-2 px-3.5 py-2 text-xs"><Plus className="h-4 w-4" />助手入职</Button></div>}
    </div>
    {serviceError && !isWorkbenchOpen && <div role="alert" className="mb-3 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800"><strong className="mr-2">操作未完成</strong>{serviceError.includes('runtime profile') ? '该助手尚未绑定可用的执行配置，请从左下角“执行器与模型”创建配置后再为助手绑定。' : serviceError}<button type="button" aria-label="关闭错误提示" onClick={dismissError} className="ml-3 underline">关闭</button></div>}
    {(section === 'performance' || section === 'service') && <nav aria-label={`${section === 'performance' ? '绩效考核' : '服务受理'}页面`} className="mb-3 flex shrink-0 gap-2">{(section === 'performance' ? performancePages : servicePages).map((item) => <Button key={item.id} type="button" onClick={() => onPortalNavigate(item.id)} className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${portalPage === item.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</Button>)}</nav>}
    <div className={`min-h-0 flex-1 ${section === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{section === 'members' ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{team.employees.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><h3 className="text-sm font-bold text-slate-800">团队还没有助手</h3><p className="mt-2 text-xs leading-5 text-slate-500">点击“助手入职”，选择可用执行器与模型，为团队添加第一位成员。</p></div>}{team.employees.map((employee) => <article key={employee.id} className="min-h-36 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: employee.color }}><UserRound className="h-5 w-5" /></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{employee.isLead ? '负责人' : employee.status === 'working' ? '工作中' : '在席'}</span></div>
      <strong className="mt-3 block text-sm text-slate-900">{employee.displayName}</strong><span className="mt-1 block text-xs text-slate-500">{employee.roleName}</span><span className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><Wrench className="h-3.5 w-3.5" />{employee.builtInSkills.length} 项技能 · {employee.activeSession.contextMeasuredAt ? `${employee.activeSession.contextRatio}%` : '上下文未上报'}</span>
      <div className="mt-4 flex gap-1.5 border-t border-slate-100 pt-3"><Button variant="ghost" type="button" onClick={() => openWorkbench(employee.id)} className="mr-auto px-2 py-1 text-[11px]">打开工作台</Button><Button variant="ghost" type="button" aria-label={`配置助手 ${employee.displayName}`} onClick={() => setConfigEmployeeId(employee.id)} className="flex h-7 items-center gap-1 px-2 text-[11px]" title="助手配置"><Settings2 className="h-3.5 w-3.5" />助手配置</Button>{!employee.isLead && <Button type="button" aria-label={`设 ${employee.displayName} 为负责人`} onClick={() => setTeamLead(team.id, employee.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="设为负责人"><Crown className="h-3.5 w-3.5" /></Button>}{!employee.isLead && <Button type="button" aria-label={`移除 ${employee.displayName}`} onClick={() => { setRemovingId(employee.id); setRemoveError(''); }} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="移出团队"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
    </article>)}</div> : section === 'chat' ? <TeamChatView team={team} /> : section === 'performance' || section === 'service' ? <PortalPageView page={portalPage ?? (section === 'performance' ? 'businessPerformance' : 'businessBreakdown')} team={team} /> : <TeamSettingsView team={team} />}</div>
  </div><Dialog open={Boolean(removingId)} busy={removing} onClose={() => setRemovingId(null)} title="移除助手" description={`将 ${team.employees.find(employee => employee.id === removingId)?.displayName ?? ''} 移出团队。当前执行会先停止，未完成工作退回待分配，已完成工作和工作目录保留。`}>
    <div className="space-y-3 px-5 pb-5">{removeError && <p role="alert" className="text-xs text-rose-600">{removeError}</p>}<Button disabled={removing} onClick={() => setRemovingId(null)}>取消</Button><Button disabled={removing} onClick={async () => { if (!removingId) return; setRemoving(true); try { await removeEmployee(team.id, removingId); setRemovingId(null); } catch(error) { setRemoveError(error instanceof Error ? error.message : String(error)); } finally { setRemoving(false); } }}>确认移除助手</Button></div>
    </Dialog>{configEmployee && <EmployeeConfigDialog employee={configEmployee} team={team} onClose={() => setConfigEmployeeId(null)} />}</section>;
}
