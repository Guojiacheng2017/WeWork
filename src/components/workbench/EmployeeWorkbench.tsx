import { workbenchTabs, tabMessages } from './workbenchTabs';
import { LatestMessageButton } from '../common/LatestMessageButton';
import { OperationNotice } from '../common/OperationNotice';
import { SessionManager } from './SessionManager';
import { Button, NativeSelect, Select } from '../ui';
import { SessionContextSummary } from './SessionContextSummary';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { WorkContextPanel } from './WorkContextPanel';
import { weworkMode } from '../../api/weworkApi';
import React, { useEffect, useState, useRef } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import {
  X,
  Layers,
  FileCode,
  FileText,
  Activity,
  Zap,
  CheckCircle2,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import { weworkHost, type HarnessModel, type RuntimeEvent } from '../../runtime/weworkHost';
import { executionWithCatalogModel } from '../team/workspaceDraft';
import { EmployeeConfigDialog } from '../team/TeamManagementView';
import { MarkdownMessage } from '../common/MarkdownMessage';
import { ConversationComposer } from '../common/ConversationComposer';
import { agentPermissionOptions } from '../../domain/agentPermissions';
import type { AgentPermissionMode } from '../../domain/wework';

export const EmployeeWorkbench: React.FC = () => {
  const { teams, selectedTeamId, selectedEmployeeId, workbenchTabId, selectWorkbenchTab, isWorkbenchOpen, closeWorkbench, sendWorkbenchMessage, completeCurrentWork, returnCurrentWork, cancelWork, stopEmployee, operationNotice, dismissError, workbenchNotice } =
    useWeWorkStore();
  useEffect(() => {
    const dismiss = (event: Event) => document.querySelectorAll('details.group\\/context[open]').forEach(node => { if (!node.contains(event.target as Node)) node.removeAttribute('open'); });
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const contextRef = useRef<HTMLDetailsElement>(null);
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const draftKey = `${selectedEmployeeId}:${workbenchTabId}`;
  const inputText = drafts[draftKey] ?? '';
  const setInputText = (value: string) => setDrafts(previous=>({...previous,[draftKey]:value}));
  const [seen, setSeen] = useState<Record<string,string>>({});
  const [stopping, setStopping] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [runtimeEvent, setRuntimeEvent] = useState<RuntimeEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<'details' | 'config'>('details');
  const [harnessModels, setHarnessModels] = useState<HarnessModel[]>([]);

  useEffect(() => {
    if (!window.runtimeCoordinator) return;
    return window.runtimeCoordinator.subscribe(setRuntimeEvent);
  }, []);
  useEffect(() => { if (isWorkbenchOpen) void weworkHost.harnessModels().then((catalog) => setHarnessModels(catalog.models)).catch(() => setHarnessModels([])); }, [isWorkbenchOpen, selectedEmployeeId]);
  const dialogRef = useDialogFocus(isWorkbenchOpen, () => {
    if (selectedArtifactId) setSelectedArtifactId(null);
    else closeWorkbench();
  });

  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const employee = currentTeam?.employees.find((b) => b.id === selectedEmployeeId);
  const tabs = employee && currentTeam ? workbenchTabs(employee,currentTeam) : [];
  const selectedTab = tabs.find(tab=>tab.id===workbenchTabId) ?? tabs[0];
  const tabId = selectedTab?.id ?? 'private';
  const messages = employee && currentTeam ? tabMessages(currentTeam,employee,tabId) : [];
  const selectedSession = selectedTab?.session ?? (employee ? {...employee.activeSession,id:`uninitialized-${tabId}`,messages:[],metrics:[],contextRatio:0,contextMeasuredAt:undefined,activity:undefined} : undefined);
  const currentEmployee = employee && selectedSession ? {...employee,artifacts:tabId==='private'?employee.artifacts:[],activeSession:{...selectedSession,execution:employee.activeSession.execution,permissionMode:employee.activeSession.permissionMode,messages},currentWorkItem:selectedTab?.work} : undefined;
  const activeWork = selectedTab?.work && employee?.currentWorkItem?.id === selectedTab.work.id;
  const readOnlyWork = tabId !== 'private' && tabId !== 'group' && !activeWork;
  const stamp = `${messages.length}:${messages.at(-1)?.text ?? ''}`;
  useEffect(()=>{if(employee)setSeen(previous=>({...previous,[`${employee.id}:${tabId}`]:stamp}));},[employee?.id,tabId,stamp]);
  useEffect(()=>{
    if (!isWorkbenchOpen || !employee || !window.weworkHost || !('weworkCall' in window.weworkHost)) return;
    void window.weworkHost.weworkCall('ensureConversation',[employee.id,tabId]).then(()=>useWeWorkStore.getState().hydrate()).catch(()=>{});
  },[isWorkbenchOpen,employee?.id,tabId]);
  const selectedArtifact = currentEmployee?.artifacts.find((artifact) => artifact.id === selectedArtifactId);
  const conversation = useConversationScroll(`${isWorkbenchOpen}:${currentEmployee?.activeSession.id}`, currentEmployee?.activeSession.messages);
  useEffect(()=>{setRuntimeEvent(null);},[currentEmployee?.activeSession.id]);
  const sendingRef = useRef(false);
  if (!isWorkbenchOpen || !currentEmployee) return null;

  const serviceError = operationNotice?.employeeId === currentEmployee.id && (!operationNotice.tabId || operationNotice.tabId === tabId) ? operationNotice.message : null;
  const handleSend = async (message = inputText) => {
    if (sendingRef.current) return;
    if (!message.trim()) return false;
    conversation.latest();
    const draft = message;
    sendingRef.current = true;
    try { if (await sendWorkbenchMessage(currentEmployee.id, draft, tabId)) { setInputText(''); return true; } return false; } finally { sendingRef.current = false; }
  };
  const nativeHost = window.weworkHost && 'weworkCall' in window.weworkHost ? window.weworkHost : null;
  const currentHarness = currentEmployee.activeSession.execution?.adapter === 'smalldash' ? 'smalldashharness' : currentEmployee.activeSession.execution?.adapter;
  const selectableModels = harnessModels.filter((model) => model.harness === currentHarness);
  const measuredContextRatio = currentEmployee.activeSession.contextMeasuredAt ? currentEmployee.activeSession.contextRatio : null;
  const selectModel = async (modelId: string) => {
    const model = selectableModels.find((item) => item.id === modelId);
    const execution = currentEmployee.activeSession.execution;
    if (!model || !execution) return;
    await useWeWorkStore.getState().updateEmployee(currentEmployee.id, { displayName: currentEmployee.displayName, roleName: currentEmployee.roleName, runtime: currentEmployee.runtime, skills: currentEmployee.builtInSkills, defaultRuntimeProfileId: currentEmployee.defaultRuntimeProfileId, workspaceAssignment: currentEmployee.workspaceAssignment, sessionExecution: { ...executionWithCatalogModel(execution, model), profileRevision: execution.profileRevision + 1 }, sessionContextTagIds: currentEmployee.activeSession.contextTagIds });
  };
  const selectPermissionMode = async (mode: AgentPermissionMode) => {
    await useWeWorkStore.getState().updateEmployee(currentEmployee.id, { displayName: currentEmployee.displayName, roleName: currentEmployee.roleName, runtime: currentEmployee.runtime, skills: currentEmployee.builtInSkills, defaultRuntimeProfileId: currentEmployee.defaultRuntimeProfileId, workspaceAssignment: currentEmployee.workspaceAssignment, sessionPermissionMode: mode });
  };


  const workStatus = currentEmployee.activeSession.activity ?? {state:'idle',detail:readOnlyWork ? '工作未在执行，可查看记录' : '当前会话未在执行'};
  return (
    <div className="ww-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWorkbench(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${currentEmployee.displayName} 工作台`} tabIndex={-1} style={{ viewTransitionName: 'employee-workbench' }} data-details-open={detailsOpen} className="employee-workbench group/workbench relative bg-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-xl p-1">
          {!detailsOpen && <button type="button" aria-label="展开助手侧栏" aria-expanded={false} onClick={() => setDetailsOpen(true)} className="workbench-avatar-toggle"><EmployeeBotAvatar size={34} bodyColor={currentEmployee.color} status={currentEmployee.status} showBadge={false} /></button>}
          <Button type="button" aria-label="关闭助手工作台" onClick={closeWorkbench} className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-500 shadow-sm hover:bg-slate-100"><X className="h-4 w-4" /></Button>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 flex overflow-hidden">
          {/* Left Column: Task & Conversation (60%) */}
          <div className="workbench-conversation min-w-0 flex-1 border-slate-100 flex flex-col bg-white">
            <div role="tablist" aria-label="助手会话" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/60 px-3 pt-3 pr-16">
              {tabs.map(tab=>{
                const tabRows=employee && currentTeam ? tabMessages(currentTeam,employee,tab.id) : [];
                const unread=tab.id!==tabId && tabRows.length>0 && seen[`${employee?.id}:${tab.id}`]!==`${tabRows.length}:${tabRows.at(-1)?.text ?? ''}`;
                const status=tab.session?.activity?.state;
                return <button key={tab.id} id={`tab-${tab.id}`} role="tab" aria-label={tab.title} aria-selected={tab.id===tabId} aria-controls="workbench-tab-panel" tabIndex={tab.id===tabId?0:-1} onClick={()=>selectWorkbenchTab(tab.id)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=tabs.findIndex(item=>item.id===tab.id);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectWorkbenchTab(tabs[next].id);document.getElementById(`tab-${tabs[next].id}`)?.focus();}}} className={`flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-3 text-xs ${tab.id===tabId?'border-sky-600 bg-white font-semibold text-sky-800':'border-transparent text-slate-500 hover:bg-white'}`}>
                  <span className="max-w-40 truncate">{tab.title}</span>
                  {status==='working'?<span className="text-[10px] text-sky-600">执行中</span>:status==='error'?<span className="text-[10px] text-rose-600">异常</span>:tab.work?.status==='completed'?<span className="text-[10px] text-emerald-600">已完成</span>:tab.work?.cancelledAt?<span className="text-[10px]">已取消</span>:tab.work && tab.work.id!==employee?.currentWorkItem?.id?<span className="text-[10px]">排队</span>:tab.session?.activity?.detail==='执行已停止'?<span className="text-[10px]">已停止</span>:null}
                  {unread&&<span aria-label="有未读更新" className="h-1.5 w-1.5 rounded-full bg-sky-500"/>}
                </button>;
              })}
            </div>
            {tabId==='group'&&<p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">{currentTeam?.name} · {employee?.displayName} 可查看的群聊消息；发送内容会进入群聊。</p>}
            {/* Active Task Banner if present */}
            {currentEmployee.currentWorkItem && (
              <div className="p-4 bg-sky-50/50 border-b border-sky-100 flex items-start gap-3">
                <Zap className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded-sm">
                      工作
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {currentEmployee.currentWorkItem.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    {currentEmployee.currentWorkItem.goal}
                  </p>
                </div>
                {activeWork && <div className="flex shrink-0 gap-1.5">
                  <Button variant="secondary" type="button" onClick={() => { if (window.confirm(`确定取消“${currentEmployee.currentWorkItem?.title}”吗？队列中的下一项将自动开始。`)) void cancelWork(currentEmployee.currentWorkItem!.id); }} className="border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50">取消工作</Button>
                  <Button variant="secondary" type="button" onClick={() => returnCurrentWork(currentEmployee.id)} className="px-2.5 py-1.5 text-[11px]">退回待办</Button>
                  <Button type="button" disabled={weworkMode === 'local' && (currentEmployee.currentWorkItem.workflowNodeId ? !['submitted', 'accepted'].includes(currentEmployee.currentWorkItem.deliveryStatus ?? '') : currentEmployee.currentWorkItem.deliveryStatus !== 'accepted')} title={weworkMode === 'local' ? currentEmployee.currentWorkItem.workflowNodeId ? '提交有效交付物后即可流转到下游' : '交付验收通过后可完成任务' : undefined} onClick={() => completeCurrentWork(currentEmployee.id)} className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700">标记完成</Button>
                </div>}
              </div>
            )}

            {/* Conversation Messages */}
            {tabId==='private'&&<SessionManager key={currentEmployee.id} employee={currentEmployee}/>}<div ref={conversation.ref} onScroll={conversation.onScroll} id="workbench-tab-panel" role="tabpanel" aria-labelledby={`tab-${tabId}`} aria-label="助手会话消息" className="min-h-0 flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30">
              {currentEmployee.activeSession.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const isSystem = msg.sender === 'system';
                const isThinking = isSystem && (msg.runtimeKind==='thinking'||msg.id.endsWith('-thinking'));

                if (isSystem) {
                  if (isThinking) {
                    return (
                      <details key={msg.id} className="group mx-auto my-2 max-w-[90%] text-[11px] text-slate-400">
                        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-100 px-3 py-1 hover:text-slate-600">
                          <Activity className="h-3 w-3" />
                          <span>已思考</span>
                          <span className="text-[11px] group-open:hidden">查看过程</span>
                          <span className="hidden text-[11px] group-open:inline">收起过程</span>
                        </summary>
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 leading-5 text-slate-500 whitespace-pre-wrap">
                          {msg.text.replace(/^思考\s*·\s*/, '')}
                        </div>
                      </details>
                    );
                  }
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/60 flex items-center gap-1.5">
                        <Activity className="w-3 h-3 text-slate-400" />
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {!isUser && (
                      <EmployeeBotAvatar
                        size={28}
                        bodyColor={currentEmployee.color}
                        status={currentEmployee.status}
                        showBadge={false}
                      />
                    )}
                    <div
                      className={`group/message max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                        isUser
                          ? 'bg-slate-900 text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                      }`}
                    >
                      <MarkdownMessage inverted={isUser}>{msg.text}</MarkdownMessage>
                      <div
                        className={`mt-1 text-right font-mono text-[11px] opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 ${
                          isUser ? 'text-slate-400' : 'text-slate-400'
                        }`}
                      >
                        {msg.time}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message Composer */}
            {workStatus.state === 'working' && <div className="mx-4 flex justify-end"><Button type="button" variant="secondary" disabled={stopping} onClick={async () => { setStopping(true); try { await stopEmployee(currentEmployee.id, tabId); } finally { setStopping(false); } }} className="text-rose-600">{stopping ? '正在停止…' : '停止执行'}</Button></div>}
            {workbenchNotice?.employeeId===currentEmployee.id && !serviceError && <p role="status" className="mx-4 text-[11px] text-slate-400">{workbenchNotice.text}</p>}
            {workStatus.state === 'error' && <div role="status" className="mx-4 rounded-xl bg-rose-50 px-4 py-2 text-xs text-rose-700">最近执行异常：{workStatus.detail}</div>}
            {serviceError && <OperationNotice message={serviceError} onDismiss={dismissError} />}
            {conversation.away && <LatestMessageButton onClick={conversation.latest}/>}
            <ConversationComposer key={`${currentEmployee.id}:${tabId}`}
              disabled={readOnlyWork}
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSend}
              ariaLabel={`向 ${currentEmployee.displayName} 的${selectedTab?.title}发送消息`}
              placeholder={readOnlyWork ? '此工作当前不可执行，可查看历史记录' : workStatus.state === 'working' ? `补充「${selectedTab?.title}」的指令…` : `发送到「${selectedTab?.title}」…`}
              commands={[
                {name:'stop',description:'停止本次执行，保留工作和记录',run:()=>stopEmployee(currentEmployee.id, tabId)},
                ...(tabId==='private' ? [{name:'model',description:'切换模型',disabledReason:!selectableModels.length ? '当前执行器未提供可选模型' : currentEmployee.status === 'working' ? '执行结束后可切换模型' : undefined,currentValue:currentEmployee.activeSession.execution?.model.modelId, options:selectableModels.map(model=>({name:model.id,description:model.name,disabledReason:currentEmployee.status === 'working' ? '执行结束后可切换模型' : undefined,run:()=>selectModel(model.id)}))}] : []),
                ...(tabId==='private' && currentHarness === 'pi' && nativeHost ? [
                  {name:'pi:compact',description:'压缩当前上下文',currentValue:'Pi 原生',run:async()=>{const result=await nativeHost!.weworkCall('nativeHarnessCommand',[currentEmployee.id,'pi:compact']) as {skipped?:boolean};if(result.skipped)return 'Pi 原生 · 当前会话较短或已经压缩，无需再次压缩。';await useWeWorkStore.getState().hydrate();return 'Pi 原生 · 当前上下文已压缩，下次回复后更新占用。';}},
                  {name:'pi:status',description:'查看执行器会话状态',currentValue:'Pi 原生',run:async()=>{const result=await nativeHost!.weworkCall('nativeHarnessCommand',[currentEmployee.id,'pi:status']) as {totalMessages?:number};return `Pi 原生 · 当前执行器会话有 ${result.totalMessages ?? '未知数量的'} 条消息`; }},
                ] : []),
                {name:'context',description:'查看上下文',run:()=>{if(contextRef.current)contextRef.current.open=true;}},
                {name:'settings',description:'助手配置',run:()=>{setDetailsOpen(true);setRightPanel('config');}},
                ...(tabId==='private' ? [{name:'clear',disabledReason:employee?.executionActivity?.state==='working' && workStatus.state!=='working' ? '其他 Tab 正在执行，请勿重置助手上下文' : undefined,description:'重新开始，保留只读历史',run:async()=>{if(!window.confirm('重新开始当前对话？旧消息会保留为只读历史，当前执行将先停止。'))throw new Error('已取消重新开始');await useWeWorkStore.getState().resetEmployeeContext(currentEmployee.id);}}] : []),
              ]}
              leadingControls={
                <details ref={contextRef} className="group/context relative">
                  <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-full px-1.5 pr-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white hover:text-slate-800" title="查看当前会话 Context 构成">
                    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: measuredContextRatio === null ? 'rgb(226 232 240)' : `conic-gradient(rgb(14 165 233) ${Math.min(100, measuredContextRatio)}%, rgb(226 232 240) 0)` }}><span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-slate-50 text-[7px] font-bold text-slate-600">{measuredContextRatio ?? '—'}</span></span>
                    <span>Context</span>
                  </summary>
                  <div className="absolute bottom-24 left-0 z-30 w-80 max-w-[calc(100vw-4rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <SessionContextSummary session={currentEmployee.activeSession}/>
                  </div>
                </details>
              }
              trailingControls={<>
                <Select label="当前会话权限" className="workbench-permission" value={currentEmployee.activeSession.permissionMode ?? 'auto'} disabled={tabId!=='private' || employee?.executionActivity?.state === 'working'} options={agentPermissionOptions.map(option => ({ value: option.mode, label: option.label }))} onChange={mode => void selectPermissionMode(mode as AgentPermissionMode)} />
                <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 shadow-xs" title="Harness 只能在助手配置中更改">{currentHarness ?? '未配置 Harness'}</span>
                <label className="group/model relative inline-flex h-8 max-w-[260px] items-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-xs transition-colors hover:border-slate-400 hover:bg-slate-50 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                  <span className="sr-only">当前 Session 模型</span>
                  <NativeSelect aria-label="当前 Session 模型" title="切换当前 Session 模型" disabled={tabId!=='private' || !currentEmployee.activeSession.execution || employee?.executionActivity?.state === 'working' || !selectableModels.length} value={currentEmployee.activeSession.execution?.modelCatalogId ?? ''} onChange={(event) => void selectModel(event.target.value)} className="h-full w-full cursor-pointer appearance-none bg-transparent pl-3 pr-8 text-[11px] font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-50"><option value="">{selectableModels.length ? '选择模型' : currentEmployee.activeSession.execution?.model.modelId ?? '无可用模型'}</option>{selectableModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</NativeSelect>
                  <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400 transition-colors group-hover/model:text-slate-700" />
                </label>
              </>}
            />
          </div>

          {/* Right Column: cards are created only for information the employee has. */}
          {detailsOpen && <div className="workbench-sidebar flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
            <Button variant="secondary" type="button" onClick={() => setDetailsOpen(false)} className="workbench-identity m-4 mb-0 shrink-0 flex items-center gap-3 p-3 pr-12 text-left" aria-label="收起助手侧栏"><EmployeeBotAvatar size={36} bodyColor={currentEmployee.color} status={currentEmployee.status} showBadge={false} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm text-slate-900">{currentEmployee.displayName}</strong>{currentEmployee.isLead && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold text-rose-700">LEADER</span>}</span><span className="mt-1 block truncate text-[11px] text-slate-500">{currentEmployee.roleName} · {currentHarness}</span><span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${runtimeEvent?.type === 'run.failed' ? 'bg-rose-50 text-rose-700' : runtimeEvent ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{runtimeEvent?.type === 'run.started' ? 'Runtime 已启动' : runtimeEvent?.type === 'assistant.delta' ? 'Runtime 输出中' : runtimeEvent?.type === 'assistant.activity' ? (runtimeEvent.activity === 'tool' ? 'Runtime 调用工具' : 'Runtime 处理中') : runtimeEvent?.type === 'run.succeeded' ? 'Runtime 已完成' : runtimeEvent?.type === 'run.failed' ? 'Runtime 失败' : currentEmployee.status === 'working' ? '正在执行' : currentEmployee.activeSession.messages.some((message) => message.sender === 'employee') ? '最近回复已保存' : window.weworkHost ? '桌面执行器已连接' : '浏览器模式'}</span></span></Button>
            <div className={rightPanel === 'config' ? 'min-h-0 flex-1 overflow-hidden' : 'workbench-details min-h-0 flex-1 overflow-y-auto p-4 space-y-4'}>
            {rightPanel === 'config' ? <EmployeeConfigDialog embedded employee={employee!} team={currentTeam} onClose={() => setRightPanel('details')} /> : <>
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-800">{selectedTab?.title}</h4><div className="flex items-center gap-2"><button type="button" onClick={() => setRightPanel('config')} className="text-[11px] font-semibold text-sky-700 hover:underline">助手配置</button><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${currentEmployee.status === 'working' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{workStatus.state === 'working' ? '运行中' : '就绪'}</span></div></div>
              <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[11px]"><dt className="text-slate-400">Harness</dt><dd className="font-semibold text-slate-700">{currentEmployee.activeSession.execution?.adapter ?? currentEmployee.runtime}</dd><dt className="text-slate-400">模型</dt><dd className="truncate font-semibold text-slate-700" title={currentEmployee.activeSession.execution?.model.modelId}>{currentEmployee.activeSession.execution?.model.modelId ?? '未配置'}</dd><dt className="text-slate-400">Session ID</dt><dd className="truncate font-mono text-slate-500" title={currentEmployee.activeSession.id}>{currentEmployee.activeSession.id}</dd><dt className="text-slate-400">Workspace</dt><dd className="truncate text-slate-500" title={currentEmployee.workspaceAssignment?.rootPath ?? currentTeam?.workspaceAssignment?.rootPath}>{currentEmployee.workspaceAssignment?.rootPath ?? currentTeam?.workspaceAssignment?.rootPath ?? '团队默认目录'}</dd><dt className="text-slate-400">消息</dt><dd className="text-slate-500">{currentEmployee.activeSession.messages.length} 条</dd></dl>
            </div>
            {/* 2. Built-in Skills */}
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
              <h4 className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-600" />
                具备内嵌技能 ({currentEmployee.builtInSkills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {currentEmployee.builtInSkills.map((skill) => (
                  <span
                    key={skill.id}
                    className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    {skill.name}
                  </span>
                ))}
                {currentEmployee.builtInSkills.length === 0 && <p className="text-[11px] leading-4 text-slate-400">未给该助手分配 WeWork Skill。Harness 自带能力由 Harness 自己管理，不在这里伪装成已分配 Skill。</p>}
              </div>
            </div>

            {weworkMode === 'local' && currentEmployee.currentWorkItem && <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs"><WorkContextPanel key={currentEmployee.currentWorkItem.id} work={currentEmployee.currentWorkItem} /></div>}
            {((currentEmployee.queuedWorkItems?.length ?? 0) > 0 || (currentEmployee.completedWorkItems?.length ?? 0) > 0) && <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-800">工作记录</h4><span className="text-[11px] text-slate-400">队列 {currentEmployee.queuedWorkItems?.length ?? 0} · 完成 {currentEmployee.completedWorkItems?.length ?? 0}</span></div>
              {(currentEmployee.queuedWorkItems?.length ?? 0) > 0 && <div className="mt-3 space-y-1.5">{currentEmployee.queuedWorkItems?.map((work, index) => <div key={work.id} className="flex items-center gap-2 rounded-lg bg-amber-50/60 px-2.5 py-2 text-[11px]"><span className="font-mono text-amber-700">#{index + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{work.title}</span><span className="text-amber-700">待执行</span><button type="button" aria-label={`取消 ${work.title}`} onClick={() => { if (window.confirm(`确定取消排队工作“${work.title}”吗？`)) void cancelWork(work.id); }} className="rounded px-1.5 py-1 font-semibold text-rose-500 hover:bg-rose-100">取消</button></div>)}</div>}
              {(currentEmployee.completedWorkItems?.length ?? 0) > 0 && <div className="mt-3 space-y-1.5">{currentEmployee.completedWorkItems?.slice(-3).reverse().map((work) => <div key={work.id} className="flex items-center gap-2 rounded-lg bg-emerald-50/60 px-2.5 py-2 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{work.title}</span><span className="text-emerald-700">已完成</span></div>)}</div>}
            </div>}

            {/* 3. Output Artifacts */}
            <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
              <h4 className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-slate-600" />
                产出物与归档 (Artifacts)
              </h4>
              <div className="space-y-2">
                  {currentEmployee.artifacts.map((art) => (
                    <div
                      key={art.id}
                      className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{art.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{art.size} • {art.createdAt}</div>
                        </div>
                      </div>
                      <Button variant="secondary" type="button" onClick={() => setSelectedArtifactId(art.id)} className="text-[11px] cursor-pointer px-2 py-1">
                        查阅
                      </Button>
                    </div>
                  ))}
                  {currentEmployee.artifacts.length === 0 && <p className="text-[11px] text-slate-400">当前 Session 尚未登记产物。</p>}
              </div>
            </div>
            </>}
            </div>
            <div className="flex shrink-0 justify-center border-t border-slate-200 bg-white px-4 py-3"><div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><Button type="button" onClick={() => setRightPanel('details')} className={`rounded-lg px-5 py-2 text-[11px] font-semibold transition-all ${rightPanel === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Layers className="mr-1.5 inline h-3.5 w-3.5" />详细信息</Button><Button type="button" onClick={() => setRightPanel('config')} className={`rounded-lg px-5 py-2 text-[11px] font-semibold transition-all ${rightPanel === 'config' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Settings2 className="mr-1.5 inline h-3.5 w-3.5" />助手配置</Button></div></div>
          </div>}
        </div>
      </div>
      {selectedArtifact && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-900/25 p-6" onClick={() => setSelectedArtifactId(null)}>
          <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()} aria-label="产出物详情">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[11px] font-semibold uppercase text-slate-400">{selectedArtifact.type}</p><h4 className="mt-1 text-sm font-bold text-slate-900">{selectedArtifact.name}</h4></div>
              <Button variant="ghost" type="button" aria-label="关闭产出物详情" onClick={() => setSelectedArtifactId(null)} className="grid h-8 w-8 place-items-center"><X className="h-4 w-4" /></Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-600">{selectedArtifact.description || '当前仅保存产出物元数据；文件存储与预览服务尚未接入。'}</p>
            <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{selectedArtifact.size}</span><span>{selectedArtifact.createdAt}</span></div>
          </section>
        </div>
      )}
    </div>
  );
};
