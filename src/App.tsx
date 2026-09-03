import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useWeWorkStore } from './state/weworkStore';
import { TeamSidebar } from './components/layout/TeamSidebar';
import { StageHeader } from './components/layout/StageHeader';
import { PendingWorkBar } from './components/layout/PendingWorkBar';
import { WeWorkStage3D } from './components/WeWorkStage3D';
import { WorkflowDagStage } from './components/stage/WorkflowDagStage';
import { TeamManagementView } from './components/team/TeamManagementView';
import { ExecutionSettingsDialog } from './components/modals/ExecutionSettingsDialog';
import { EmployeeWorkbench } from './components/workbench/EmployeeWorkbench';
import { CreateTeamModal } from './components/modals/CreateTeamModal';
import { AddEmployeeModal } from './components/modals/AddEmployeeModal';
import { PortalPageView } from './components/portal/PortalPageView';
import type { PortalPage } from './domain/portalNavigation';
import { RuntimeMonitor } from './components/debug/RuntimeMonitor';

const ProjectManagementView = lazy(() => import('./components/project/ProjectManagementView'));

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('wework.sidebarCollapsed') === 'true');
  const [pendingPanelWidth, setPendingPanelWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('wework.pendingPanelWidth'));
    return Number.isFinite(stored) && stored >= 300 && stored <= 520 ? stored : 380;
  });
  const [roundPendingVisible, setRoundPendingVisible] = useState(true);
  const [portalPage, setPortalPage] = useState<PortalPage | null>(null);
  const [roundResize, setRoundResize] = useState<{ startX: number; startWidth: number } | null>(null);
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


  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const employees = currentTeam?.employees || [];
  const draggedWork = currentTeam?.pendingWorks.find((work) => work.id === draggingWorkItemId) ?? null;


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
        {portalPage === null ? <StageHeader /> : null}

        {/* Central Pure 2D Stage */}
        <div className="flex-1 relative w-full h-full overflow-hidden bg-slate-50/50">
          {portalPage ? <PortalPageView page={portalPage} team={currentTeam} /> : <div className="workspace-view min-w-0">
            {topology === 'issues' || topology === 'board' || topology === 'gantt' ? (
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">正在加载项目模块…</div>}><ProjectManagementView team={currentTeam!} view={topology} /></Suspense>
            ) : topology === 'roundTable' ? (
              <div className="relative flex h-full gap-2 p-4" onPointerMove={(event) => { if (roundResize) setPendingPanelWidth(Math.max(300, Math.min(520, roundResize.startWidth + roundResize.startX - event.clientX))); }} onPointerUp={() => setRoundResize(null)} onPointerCancel={() => setRoundResize(null)}>
              <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]" aria-label="圆桌协作区">
                  <WeWorkStage3D
                    employees={employees}
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
              {roundPendingVisible ? <><div role="separator" aria-label="调整圆桌与待办宽度" aria-orientation="vertical" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setRoundResize({ startX: event.clientX, startWidth: pendingPanelWidth }); }} className={`group relative w-2 shrink-0 cursor-col-resize ${roundResize ? 'cursor-col-resize' : ''}`}><span className="absolute bottom-1/2 left-1/2 h-12 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-slate-300 transition-colors group-hover:bg-sky-400" /></div><div className="min-w-0 shrink-0" style={{ width: pendingPanelWidth }}><PendingWorkBar embedded onEmbeddedClose={() => setRoundPendingVisible(false)} /></div></> : <button type="button" onClick={() => setRoundPendingVisible(true)} style={{ width: pendingPanelWidth }} className="absolute right-4 top-4 z-20 flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.08)] hover:bg-slate-50"><span>待办公文与任务</span><span className="text-slate-400">恢复抽屉</span></button>}
              </div>
            ) : topology === 'workflowDag' ? (
              <WorkflowDagStage workflow={currentTeam?.workflow} employees={employees} pendingPanelWidth={pendingPanelWidth} onPendingPanelWidthChange={setPendingPanelWidth} />
            ) : (
              <TeamManagementView />
            )}
          </div>}

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
