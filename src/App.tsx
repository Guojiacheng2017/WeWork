import { product } from './product';
import { usePluginCatalog } from './components/project/projectNavigation';
import { PLANE_PLUGIN_ID } from './domain/collaboration';
import { ProjectPluginLayout } from './components/project/ProjectPluginLayout';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useWeWorkStore } from './state/weworkStore';
import { MainWorkspace } from './components/workspace/MainWorkspace';
import { StageHeader } from './components/layout/StageHeader';
import { WorkflowDagStage } from './components/stage/WorkflowDagStage';
import { TeamManagementView } from './components/team/TeamManagementView';
import { ExecutionSettingsDialog } from './components/settings/ExecutionSettingsDialog';
import { CreateTeamModal } from './components/modals/CreateTeamModal';
import { AddEmployeeModal } from './components/modals/AddEmployeeModal';
import type { PortalPage } from './domain/portalNavigation';
import { RuntimeMonitor } from './components/debug/RuntimeMonitor';

const ProjectManagementView = lazy(() => import('./components/project/ProjectManagementView'));

export const App: React.FC = () => {
  const pluginCatalog = usePluginCatalog();
  const [activePlugin, setActivePlugin] = useState<{ id: string; name: string; description: string } | null>(null);

  const [portalPage, setPortalPage] = useState<PortalPage | null>(null);
  const teamManagementSection = 'members' as const;
  const [monitorOpen, setMonitorOpen] = useState(false);
  const {
    teams,
    selectedTeamId,
    topology,
    setCreateTeamOpen,
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
    const subscribe = window.weworkHost?.onCloseLayer;
    if (!subscribe) return undefined;
    return subscribe(() => {
      const layerEvent = new Event('wework:close-current-layer', { cancelable: true });
      window.dispatchEvent(layerEvent);
      if (layerEvent.defaultPrevented) return;
      const state = useWeWorkStore.getState();
      if (monitorOpen) { setMonitorOpen(false); return; }
      if (state.isRuntimeProfileOpen) { state.setRuntimeProfileOpen(false); return; }
      if (state.isCreateTeamOpen) { state.setCreateTeamOpen(false); return; }
      if (state.isAddEmployeeOpen) { state.setAddEmployeeOpen(false); return; }
      if (state.isWorkbenchOpen) { state.closeWorkbench(); return; }
      if (portalPage) { setPortalPage(null); return; }
      if (activePlugin || state.topology === 'plugin') { setActivePlugin(null); state.setTopology('roundTable'); return; }
      if (state.topology !== 'roundTable') { state.setTopology('roundTable'); return; }
    });
  }, [activePlugin, monitorOpen, portalPage]);

  useEffect(() => {
    document.documentElement.classList.toggle('wework-desktop', Boolean(window.weworkHost));
    const applyEffectsPreference = () => document.documentElement.classList.toggle('wework-reduce-effects', window.localStorage.getItem('wework.reduceEffects') === 'true');
    applyEffectsPreference();
    window.addEventListener('wework:effects-preference-changed', applyEffectsPreference);
    return () => { document.documentElement.classList.remove('wework-desktop'); window.removeEventListener('wework:effects-preference-changed', applyEffectsPreference); };
  }, []);

  useEffect(() => {
    void hydrate();
    const disconnect = connectEvents();
    const disconnectRuntime = connectRuntime();
    return () => { disconnect(); disconnectRuntime(); };
  }, [hydrate, connectEvents, connectRuntime]);





  const activePluginId = ['issues', 'board', 'gantt'].includes(topology) ? PLANE_PLUGIN_ID : topology === 'plugin' ? activePlugin?.id : undefined;
  const pluginDisabled = !!activePluginId && pluginCatalog.some(plugin => plugin.name === activePluginId && !plugin.enabled);
  useEffect(() => { if (pluginDisabled) { useWeWorkStore.getState().setTopology('roundTable'); setActivePlugin(null); } }, [pluginDisabled]);
  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const employees = currentTeam?.employees ?? [];



  if (serviceStatus === 'loading') {
    return <div role="status" className="grid h-screen place-items-center bg-slate-50 text-sm text-slate-500">正在恢复工作界面…</div>;
  }

  if (serviceStatus === 'error' && teams.length === 0) {
    return <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-sm" role="alert"><strong>{product.productName}暂时无法打开</strong><span>{weworkMode === 'local' ? '本地平台数据初始化失败' : '协作同步服务暂不可用'}</span><small>{serviceError}</small><button type="button" onClick={() => void hydrate()}>重新加载</button></div>;
  }

  return (
    <>
      
    <MainWorkspace navigation={<StageHeader onPluginSelect={setActivePlugin} />} onOpenMonitor={() => setMonitorOpen(true)}>
        {/* Central Pure 2D Stage */}
        <div className="flex-1 relative w-full h-full overflow-hidden bg-slate-50/50">
          <div className="workspace-view min-w-0">
            {!currentTeam ? (
              <section className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-xl font-bold text-slate-900">创建你的第一个协作团队</h1><p className="max-w-md text-sm leading-6 text-slate-500">先创建团队，再配置执行器并添加助手，即可分派任务和开展协作。</p><button type="button" onClick={() => setCreateTeamOpen(true)} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">创建团队</button></section>
            ) : pluginDisabled ? <div role="status" className="p-6 text-sm text-slate-500">插件已在此设备停用。</div> : topology === 'plugin' ? (
              <div className="flex h-full"><nav aria-label="插件导航" className="w-48 shrink-0 border-r border-slate-200 p-4"><h2 className="mb-4 font-semibold">{activePlugin?.name ?? '插件'}</h2><span className="block rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">概览</span></nav><section className="min-w-0 flex-1 p-6"><h1 className="text-xl font-semibold">{activePlugin?.name ?? '选择插件'}</h1><p className="mt-3 text-sm text-slate-500">{activePlugin?.description}</p><p className="mt-6 text-sm text-slate-500">此插件暂未提供可视化工作页面。</p></section></div>
            ) : topology === 'issues' || topology === 'board' || topology === 'gantt' ? (
              <ProjectPluginLayout team={currentTeam} view={topology}><Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">正在加载项目模块…</div>}><ProjectManagementView team={currentTeam} view={topology} /></Suspense></ProjectPluginLayout>
            ) : topology === 'workflowDag' || topology === 'roundTable' ? (
              <WorkflowDagStage active={topology === 'workflowDag'} workflow={currentTeam?.workflow} workflows={currentTeam?.workflows} employees={employees} />
            ) : (
              <TeamManagementView initialSection={teamManagementSection} portalPage={portalPage} onPortalNavigate={setPortalPage} />
            )}
          </div>

        </div>

    </MainWorkspace>
      <CreateTeamModal />
      <AddEmployeeModal configureAfterCreation />
      {isRuntimeProfileOpen && <ExecutionSettingsDialog initialSection={settingsSection} onClose={() => setRuntimeProfileOpen(false)} />}
    {monitorOpen && <RuntimeMonitor onClose={() => setMonitorOpen(false)} />}
    </>
  );
};
