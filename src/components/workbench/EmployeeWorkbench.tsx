import { WorkContextPanel } from './WorkContextPanel';
import { weworkMode } from '../../api/weworkApi';
import React, { useEffect, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import {
  X,
  Send,
  Layers,
  FileCode,
  FileText,
  Activity,
  Zap,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import type { RuntimeEvent } from '../../runtime/weworkHost';
import { EmployeeConfigDialog } from '../team/TeamManagementView';
import { MarkdownMessage } from '../common/MarkdownMessage';

export const EmployeeWorkbench: React.FC = () => {
  const { teams, selectedTeamId, selectedEmployeeId, isWorkbenchOpen, closeWorkbench, sendWorkbenchMessage, completeCurrentWork, returnCurrentWork, cancelWork, serviceError } =
    useWeWorkStore();
  const [inputText, setInputText] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [runtimeEvent, setRuntimeEvent] = useState<RuntimeEvent | null>(null);
  const [isEmployeeConfigOpen, setEmployeeConfigOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!window.runtimeCoordinator) return;
    return window.runtimeCoordinator.subscribe(setRuntimeEvent);
  }, []);

  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const currentEmployee = currentTeam?.employees.find((b) => b.id === selectedEmployeeId);
  const selectedArtifact = currentEmployee?.artifacts.find((artifact) => artifact.id === selectedArtifactId);
  const hasDetails = Boolean(currentEmployee && (
    currentEmployee.currentWorkItem
    || currentEmployee.activeSession.contextRatio > 0
    || currentEmployee.activeSession.metrics.length > 0
    || currentEmployee.builtInSkills.length > 0
    || currentEmployee.artifacts.length > 0
    || (currentEmployee.queuedWorkItems?.length ?? 0) > 0
    || (currentEmployee.completedWorkItems?.length ?? 0) > 0
  ));

  useEffect(() => { setDetailsOpen(hasDetails); }, [currentEmployee?.id, hasDetails]);

  if (!isWorkbenchOpen || !currentEmployee) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendWorkbenchMessage(currentEmployee.id, inputText);
    setInputText('');
  };

  const chartData = currentEmployee.activeSession.metrics
    .filter((metric) => !metric.label.includes('上下文'))
    .map((metric) => ({
      name: metric.label,
      value: metric.value,
      max: metric.maximum,
      unit: metric.unit,
      percentage: metric.maximum > 0 ? Math.round((metric.value / metric.maximum) * 100) : 0,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div style={{ viewTransitionName: 'employee-workbench' }} className="bg-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 px-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            <EmployeeBotAvatar size={42} bodyColor={currentEmployee.color} status={currentEmployee.status} showBadge={false} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 leading-none">
                  {currentEmployee.displayName}
                </h3>
                {currentEmployee.isLead && (
                  <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-sm">
                    LEADER
                  </span>
                )}
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    currentEmployee.status === 'working'
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentEmployee.status === 'working' ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500'
                    }`}
                  />
                  {currentEmployee.status === 'working' ? '正在执行任务' : '就绪待命中'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                <span>{currentEmployee.roleName}</span>
                <span className="text-slate-300">•</span>
                <span>{currentEmployee.activeSession.execution ? `${currentEmployee.activeSession.execution.adapter} · ${currentEmployee.activeSession.execution.model.modelId}` : '尚未配置 Harness / 模型'}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${runtimeEvent?.type === 'run.failed' ? 'bg-rose-50 text-rose-700' : runtimeEvent ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{runtimeEvent?.type === 'run.started' ? 'Runtime 已启动' : runtimeEvent?.type === 'assistant.delta' ? 'Runtime 输出中' : runtimeEvent?.type === 'assistant.activity' ? (runtimeEvent.activity === 'tool' ? 'Runtime 调用工具' : 'Runtime 处理中') : runtimeEvent?.type === 'run.succeeded' ? 'Runtime 已完成' : runtimeEvent?.type === 'run.failed' ? 'Runtime 失败' : '等待 Desktop Runtime'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={detailsOpen} onClick={() => setDetailsOpen((open) => !open)} className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${detailsOpen ? 'bg-slate-200/70 text-slate-800' : 'text-slate-600 hover:bg-slate-200/60'}`}><Layers className="h-4 w-4" />详情{hasDetails ? '' : '（空）'}</button>
            <button type="button" aria-label={`配置助手 ${currentEmployee.displayName}`} onClick={() => setEmployeeConfigOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60" title="助手配置"><Settings2 className="h-4 w-4" />助手配置</button>
            <button
              type="button"
              aria-label="关闭助手工作台"
              onClick={closeWorkbench}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Task & Conversation (60%) */}
          <div className={`${detailsOpen ? 'w-7/12 border-r' : 'w-full'} border-slate-100 flex flex-col bg-white transition-[width] duration-200`}>
            {/* Active Task Banner if present */}
            {currentEmployee.currentWorkItem && (
              <div className="p-4 bg-sky-50/50 border-b border-sky-100 flex items-start gap-3">
                <Zap className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded-sm">
                      当前执行
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {currentEmployee.currentWorkItem.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    {currentEmployee.currentWorkItem.goal}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => { if (window.confirm(`确定取消“${currentEmployee.currentWorkItem?.title}”吗？队列中的下一项将自动开始。`)) void cancelWork(currentEmployee.currentWorkItem!.id); }} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50">取消工作</button>
                  <button type="button" onClick={() => returnCurrentWork(currentEmployee.id)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">退回待办</button>
                  <button type="button" disabled={weworkMode === 'local' && currentEmployee.currentWorkItem.deliveryStatus !== 'accepted'} title={weworkMode === 'local' ? '交付验收通过后可完成任务' : undefined} onClick={() => completeCurrentWork(currentEmployee.id)} className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-sky-700">标记完成</button>
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30">
              {currentEmployee.activeSession.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const isSystem = msg.sender === 'system';
                const isThinking = isSystem && msg.id.endsWith('-thinking');

                if (isSystem) {
                  if (isThinking) {
                    return (
                      <details key={msg.id} className="group mx-auto my-2 max-w-[90%] text-[11px] text-slate-400">
                        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-100 px-3 py-1 hover:text-slate-600">
                          <Activity className="h-3 w-3" />
                          <span>已思考</span>
                          <span className="text-[9px] group-open:hidden">查看过程</span>
                          <span className="hidden text-[9px] group-open:inline">收起过程</span>
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
                      className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                        isUser
                          ? 'bg-slate-900 text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                      }`}
                    >
                      <MarkdownMessage inverted={isUser}>{msg.text}</MarkdownMessage>
                      <div
                        className={`text-[9px] mt-1 text-right font-mono ${
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
            {serviceError && <div role="alert" className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800"><span>{serviceError.includes('execution configuration') || serviceError.includes('runtime profile') ? '当前助手尚未配置可用的 Harness 与模型。' : serviceError}</span>{(serviceError.includes('execution configuration') || serviceError.includes('runtime profile')) && <button type="button" onClick={() => setEmployeeConfigOpen(true)} className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100">配置当前助手</button>}</div>}
            <form onSubmit={handleSend} autoComplete="off" className="p-3 border-t border-slate-100 bg-white flex items-end gap-2">
              <textarea
                aria-label={`向 ${currentEmployee.displayName} 发送消息`}
                rows={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={`向 ${currentEmployee.displayName} 下达指令或补充资料…`}
                className="max-h-28 min-h-9 flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>发送</span>
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>

          {/* Right Column: cards are created only for information the employee has. */}
          {detailsOpen && <div className="w-5/12 p-5 overflow-y-auto bg-slate-50/40 space-y-5">
            {/* 1. Context Gauge Box */}
            {(currentEmployee.activeSession.contextRatio > 0 || chartData.length > 0) && <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-600" />
                  会话上下文负载 (Context Load)
                </span>
                <span className="text-xs font-black font-mono text-sky-600">
                  {currentEmployee.activeSession.contextRatio}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${currentEmployee.activeSession.contextRatio}%` }}
                />
              </div>

              {chartData.length > 0 && (
                <div className="mt-3 space-y-2.5" role="img" aria-label="Employee 运行指标">
                  {chartData.map((metric, idx) => (
                    <div key={metric.name} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
                      <span className="truncate text-[10px] font-medium text-slate-500" title={metric.name}>
                        {metric.name}
                      </span>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${idx === 0 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, metric.percentage)}%` }}
                        />
                      </div>
                      <span className="text-right text-[10px] font-mono text-slate-500">
                        {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* 2. Built-in Skills */}
            {currentEmployee.builtInSkills.length > 0 && <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
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
              </div>
            </div>}

            {weworkMode === 'local' && currentEmployee.currentWorkItem && <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs"><WorkContextPanel key={currentEmployee.currentWorkItem.id} work={currentEmployee.currentWorkItem} /></div>}
            {((currentEmployee.queuedWorkItems?.length ?? 0) > 0 || (currentEmployee.completedWorkItems?.length ?? 0) > 0) && <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-slate-800">工作记录</h4><span className="text-[10px] text-slate-400">队列 {currentEmployee.queuedWorkItems?.length ?? 0} · 完成 {currentEmployee.completedWorkItems?.length ?? 0}</span></div>
              {(currentEmployee.queuedWorkItems?.length ?? 0) > 0 && <div className="mt-3 space-y-1.5">{currentEmployee.queuedWorkItems?.map((work, index) => <div key={work.id} className="flex items-center gap-2 rounded-lg bg-amber-50/60 px-2.5 py-2 text-[11px]"><span className="font-mono text-amber-700">#{index + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{work.title}</span><span className="text-amber-700">待执行</span><button type="button" aria-label={`取消 ${work.title}`} onClick={() => { if (window.confirm(`确定取消排队工作“${work.title}”吗？`)) void cancelWork(work.id); }} className="rounded px-1.5 py-1 font-semibold text-rose-500 hover:bg-rose-100">取消</button></div>)}</div>}
              {(currentEmployee.completedWorkItems?.length ?? 0) > 0 && <div className="mt-3 space-y-1.5">{currentEmployee.completedWorkItems?.slice(-3).reverse().map((work) => <div key={work.id} className="flex items-center gap-2 rounded-lg bg-emerald-50/60 px-2.5 py-2 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{work.title}</span><span className="text-emerald-700">已完成</span></div>)}</div>}
            </div>}

            {/* 3. Output Artifacts */}
            {currentEmployee.artifacts.length > 0 && <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
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
                          <div className="text-[10px] text-slate-400 font-mono">{art.size} • {art.createdAt}</div>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSelectedArtifactId(art.id)} className="text-[10px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer px-2 py-1 rounded-md bg-white border border-slate-200">
                        查阅
                      </button>
                    </div>
                  ))}
              </div>
            </div>}
            {!hasDetails && <div className="grid h-full place-items-center text-center"><div><Layers className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-500">暂无助手详情</p><p className="mt-1 text-[10px] text-slate-400">任务、技能、指标和产物会显示在这里</p></div></div>}
          </div>}
        </div>
      </div>
      {selectedArtifact && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-900/25 p-6" onClick={() => setSelectedArtifactId(null)}>
          <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()} aria-label="产出物详情">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[11px] font-semibold uppercase text-slate-400">{selectedArtifact.type}</p><h4 className="mt-1 text-sm font-bold text-slate-900">{selectedArtifact.name}</h4></div>
              <button type="button" aria-label="关闭产出物详情" onClick={() => setSelectedArtifactId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-600">{selectedArtifact.description || '当前仅保存产出物元数据；文件存储与预览服务尚未接入。'}</p>
            <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{selectedArtifact.size}</span><span>{selectedArtifact.createdAt}</span></div>
          </section>
        </div>
      )}
      {isEmployeeConfigOpen && <EmployeeConfigDialog employee={currentEmployee} onClose={() => setEmployeeConfigOpen(false)} />}
    </div>
  );
};
