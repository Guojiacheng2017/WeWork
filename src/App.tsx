import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useWeWorkStore } from './state/weworkStore';
import { TeamSidebar } from './components/layout/TeamSidebar';
import { StageHeader } from './components/layout/StageHeader';
import { PendingWorkBar } from './components/layout/PendingWorkBar';
import { WeWorkStage3D } from './components/WeWorkStage3D';
import { WorkflowDagStage } from './components/stage/WorkflowDagStage';
import { TeamManagementView } from './components/team/TeamManagementView';
import { ExecutionSettingsDialog } from './components/settings/ExecutionSettingsDialog';
import { EmployeeWorkbench } from './components/workbench/EmployeeWorkbench';
import { CreateTeamModal } from './components/modals/CreateTeamModal';
import { AddEmployeeModal } from './components/modals/AddEmployeeModal';
import type { PortalPage } from './domain/portalNavigation';
import { RuntimeMonitor } from './components/debug/RuntimeMonitor';

const ProjectManagementView = lazy(() => import('./components/project/ProjectManagementView'));

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('wework.sidebarCollapsed') === 'true' || window.innerWidth < 768);
  const [pendingPanelWidth, setPendingPanelWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('wework.pendingPanelWidth'));
    return Number.isFinite(stored) && stored >= 300 && stored <= 520 ? stored : 380;
  });
  const [portalPage, setPortalPage] = useState<PortalPage | null>(null);
  const [teamManagementSection, setTeamManagementSection] = useState<'members' | 'chat'>('members');
  const [roundResize, setRoundResize] = useState<{ startX: number; startWidth: number } | null>(null);
  const [roundDrawersExpanded, setRoundDrawersExpanded] = useState(true);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const {
    teams,
    selectedTeamId,
    selectedEmployeeId,
    viewMode,
    topology,
    draggingWorkItemId,
    selectEmployee,
    setViewMode,
    openWorkbench,
    setAddEmployeeOpen,
    setCreateTeamOpen,
    dispatchWorkToEmployee,
    hydrate,
    connectEvents,
    connectRuntime,
    serviceStatus,
    serviceError,
    weworkMode,
    isRuntimeProfileOpen,
    settingsSection,
    setRuntimeProfileOpen,
  } = useWeWorkStore();

  useEffect(() => {
    document.documentElement.classList.toggle('wework-desktop', Boolean(window.weworkHost));
    return () => document.documentElement.classList.remove('wework-desktop');
  }, []);

  useEffect(() => {
    void hydrate();
    const disconnect = connectEvents();
    const disconnectRuntime = connectRuntime();
    return () => { disconnect(); disconnectRuntime(); };
  }, [hydrate, connectEvents, connectRuntime]);

  useEffect(() => {
    window.localStorage.setItem('wework.pendingPanelWidth', String(pendingPanelWidth));
  }, [pendingPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem('wework.sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);


  useLayoutEffect(() => {
    if (!enteringWeWork || startupSettled) return;
    const target = document.querySelector('[data-wework-brand-target]');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setBrandTarget({ left: rect.left, top: rect.top });
  }, [enteringWeWork, startupSettled, serviceStatus, sidebarCollapsed]);

  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const employees = currentTeam?.employees || [];
  const draggedWork = currentTeam?.pendingWorks.find((work) => work.id === draggingWorkItemId) ?? null;
  const openFullTeamChat = () => { setTeamManagementSection('chat'); useWeWorkStore.getState().setTopology('teamManagement'); };


  if ((!startupSettled && !enteringWeWork) || serviceStatus === 'loading') {
    return landing;
  }

  if (serviceStatus === 'error' && teams.length === 0) {
    return <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-sm" role="alert"><strong>WeWork暂时无法打开</strong><span>{weworkMode === 'local' ? '本地平台数据初始化失败' : '协作同步服务暂不可用'}</span><small>{serviceError}</small><button type="button" onClick={() => void hydrate()}>重新加载</button></div>;
  }

  return (
    <>
      
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans select-none">
      {/* 1. Left Sidebar Navigation */}
      <TeamSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} activePortalPage={portalPage} onPortalNavigate={setPortalPage} onOpenMonitor={() => setMonitorOpen(true)} />

      {/* 2. Main Work & Stage Center */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <StageHeader />

        {/* Central Pure 2D Stage */}
        <div className="flex-1 relative w-full h-full overflow-hidden bg-slate-50/50">
          <div className="workspace-view min-w-0">
            {!currentTeam ? (
              <section className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-xl font-bold text-slate-900">创建你的第一个协作团队</h1><p className="max-w-md text-sm leading-6 text-slate-500">先创建团队，再配置执行器并添加助手，即可分派任务和开展协作。</p><button type="button" onClick={() => setCreateTeamOpen(true)} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">创建团队</button></section>
            ) : topology === 'issues' || topology === 'board' || topology === 'gantt' ? (
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">正在加载项目模块…</div>}><ProjectManagementView team={currentTeam!} view={topology} /></Suspense>
            ) : topology === 'roundTable' ? (
              <div data-resizing={Boolean(roundResize)} className="wework-round-layout relative flex h-full gap-2 p-4" onPointerMove={(event) => { if (roundResize) setPendingPanelWidth(Math.max(300, Math.min(520, roundResize.startWidth + roundResize.startX - event.clientX))); }} onPointerUp={() => setRoundResize(null)} onPointerCancel={() => setRoundResize(null)}>
              <section className="wework-round-stage min-w-0 flex-1 overflow-hidden" aria-label="圆桌协作区">
                  <WeWorkStage3D
                    employees={employees}
                    deliveries={currentTeam?.collaborationDeliveries}
                    mode={viewMode}
                    selectedEmployeeId={selectedEmployeeId}
                    onModeChange={setViewMode}
                    onSelectEmployee={selectEmployee}
                    onOpenEmployee={() => openWorkbench()}
                    onAddEmployee={() => setAddEmployeeOpen(true)}
                    draggedWork={draggedWork}
                    onAssignWork={(work, employee) => dispatchWorkToEmployee(work.id, employee.id)}
                  />
              </section>
              <div className="round-drawer-shell" data-expanded={roundDrawersExpanded} style={{ width: roundDrawersExpanded ? pendingPanelWidth + 8 : 52 }}>{roundDrawersExpanded&&<div role="separator" aria-label="调整圆桌与协作抽屉宽度" aria-orientation="vertical" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setRoundResize({ startX: event.clientX, startWidth: pendingPanelWidth }); }} className="round-drawer-resize-zone relative w-2 shrink-0 cursor-col-resize"/>}<div className="wework-round-pending min-w-0 shrink-0" style={{ width: roundDrawersExpanded ? pendingPanelWidth : 52 }}><PendingWorkBar embedded onExpandedChange={setRoundDrawersExpanded} onOpenTeamChat={openFullTeamChat} /></div></div>
              </div>
            ) : topology === 'workflowDag' ? (
              <WorkflowDagStage workflow={currentTeam?.workflow} employees={employees} pendingPanelWidth={pendingPanelWidth} onPendingPanelWidthChange={setPendingPanelWidth} onOpenTeamChat={openFullTeamChat} />
            ) : (
              <TeamManagementView initialSection={teamManagementSection} portalPage={portalPage} onPortalNavigate={setPortalPage} />
            )}
          </div>

          {/* Pending work belongs to both operational views, not team administration. */}
        </div>

        {/* Bottom Clean Status Bar */}
        <footer className="h-7 bg-white border-t border-slate-200/70 px-4 flex items-center justify-between text-[11px] text-slate-400 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>当前在席: {employees.length} 名助手</span>
            </span>
            <span className="text-slate-200">|</span>
            <span className="font-medium text-slate-500">{weworkMode === 'local' ? '本地模式 · 数据已保存' : serviceStatus === 'ready' ? '协作同步已连接' : '协作同步异常'}</span>
            <span className="text-slate-200">|</span>
            <span className="hidden sm:inline">
              提示: 点击助手可选中切换，双击或平视下点击可打开工作台
            </span>
          </div>
        </footer>
      </main>

      {/* 3. Fullscreen Overlays & Dialogs */}
      <EmployeeWorkbench />
      <CreateTeamModal />
      <AddEmployeeModal />
      {isRuntimeProfileOpen && <ExecutionSettingsDialog initialSection={settingsSection} onClose={() => setRuntimeProfileOpen(false)} />}
    </div>
    {monitorOpen && <RuntimeMonitor onClose={() => setMonitorOpen(false)} />}
    </>
  );
};
