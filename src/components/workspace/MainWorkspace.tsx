import { product } from '../../product';
import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { ChevronDown, Maximize2, Minimize2, Plus, Settings2, Users, UserRound, X } from 'lucide-react';
import { useWeWorkStore } from '../../state/weworkStore';
import { WeWorkStage3D } from '../WeWorkStage3D';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import { WeWorkLogoMark } from '../employee/WeWorkLogoMark';
import { EmployeeWorkbench } from '../workbench/EmployeeWorkbench';
import { workbenchTabs } from '../workbench/workbenchTabs';
import { EmployeeConfigDialog, TeamSettingsView, TeamManagementView } from '../team/TeamManagementView';
import { PendingWorkBar, SidebarTeamChat } from '../layout/PendingWorkBar';
import { OperationNotice } from '../common/OperationNotice';
import { clampRatio, closePage, deskKey, initialDesk, openPage, readDesks, type WorkspaceDesk, type WorkspacePage } from './workspacePages';
import './workspace.css';
import { WorkspacePanelContext } from './WorkspacePanelContext';
import type { PortalPage } from '../../domain/portalNavigation';

function TeamManagementPage({ section }: { section: 'members' | 'performance' | 'service' }) {
  const [portalPage, setPortalPage] = useState<PortalPage | null>(section === 'performance' ? 'businessPerformance' : section === 'service' ? 'businessBreakdown' : null);
  return <TeamManagementView embedded initialSection={section} portalPage={portalPage} onPortalNavigate={setPortalPage} />;
}

const settingPage: WorkspacePage = { id: 'settings', kind: 'settings', title: '助手设置' };
const privatePage: WorkspacePage = { id: 'private', kind: 'session', sessionId: 'private', title: '私聊' };

export function MainWorkspace({ children, navigation, onOpenMonitor }: { children: ReactNode; navigation: ReactNode; onOpenMonitor: () => void }) {
  const state = useWeWorkStore();
  const { teams, selectedTeamId, selectedEmployeeId, viewMode, topology, selectEmployee, setViewMode, setTopology, setAddEmployeeOpen, setCreateTeamOpen } = state;
  const sharedView = topology === 'roundTable' || topology === 'workflowDag';
  const [inspectorTarget, setInspectorTarget] = useState<HTMLDivElement | null>(null);
  const team = teams.find(item => item.id === selectedTeamId);
  const [focusedId, setFocusedId] = useState<string | null>(viewMode === 'eyeLevel' ? selectedEmployeeId : null);
  const employee = team?.employees.find(item => item.id === focusedId);
  const [desks, setDesks] = useState(() => readDesks(localStorage.getItem('wework.workspaceDesks')));
  const key = deskKey(selectedTeamId, employee?.id);
  const desk = desks[key] ?? initialDesk(Boolean(employee));
  const active = desk.pages.find(page => page.id === desk.active);
  const [ratio, setRatio] = useState(() => clampRatio(Number(localStorage.getItem('wework.workspaceRatio') ?? 0.42)));
  const [contentExpanded, setExpanded] = useState(false);
  const hasPages = desk.pages.length > 0;
  const expanded = hasPages && contentExpanded;
  useEffect(() => { if (!hasPages) setExpanded(false); }, [hasPages]);
  const [teamMenu, setTeamMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [key, desk.active]);
  const layoutRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const platform = /Win/.test(navigator.platform) ? 'windows' : 'mac';
  const chord = platform === 'mac' ? '⌘' : 'Ctrl+';
  const mutateDesk = (change: (value: WorkspaceDesk) => WorkspaceDesk, targetKey = key, isEmployee = Boolean(employee)) => setDesks(previous => ({ ...previous, [targetKey]: change(previous[targetKey] ?? initialDesk(isEmployee)) }));
  const choose = (page: WorkspacePage) => mutateDesk(value => openPage(value, page));
  const newPage = () => choose({ id: crypto.randomUUID(), kind: 'blank', title: '新页面' });
  const focusSettled = useCallback((id: string) => setFocusedId(id), []);
  const focusEmployee = (id: string) => {
    selectEmployee(id); setViewMode('eyeLevel');
    if (expanded || topology === 'workflowDag') setFocusedId(id);
  };
  const openInspector = useCallback(() => {
    setDesks(previous => ({ ...previous, [key]: openPage(previous[key] ?? initialDesk(Boolean(focusedId)), { id: 'nodeConfig', kind: 'nodeConfig', title: '节点配置' }) }));
  }, [key, focusedId]);
  const closeInspector = useCallback(() => {
    setDesks(previous => ({ ...previous, [key]: closePage(previous[key] ?? initialDesk(Boolean(focusedId)), 'nodeConfig') }));
  }, [key, focusedId]);
  const showTeam = () => { setFocusedId(null); setViewMode('topDown'); };
  const openTeamPage = (page: WorkspacePage) => {
    showTeam();
    mutateDesk(value => openPage(value, page), deskKey(selectedTeamId), false);
    if (!sharedView) setTopology('roundTable');
  };
  useEffect(() => {
    if (topology === 'teamManagement') openTeamPage({ id: 'members', kind: 'members', title: '成员职责' });
  }, [topology, selectedTeamId]);
  useEffect(() => { try { localStorage.setItem('wework.workspaceDesks', JSON.stringify(desks)); } catch { /* Keep the live workspace if storage is full. */ } }, [desks]);
  useEffect(() => { localStorage.setItem('wework.workspaceRatio', String(ratio)); }, [ratio]);
  useEffect(() => { setFocusedId(null); setViewMode('topDown'); setTeamMenu(false); }, [selectedTeamId, setViewMode]);
  useEffect(() => { if (viewMode === 'topDown') setFocusedId(null); }, [viewMode]);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!teamMenuRef.current?.contains(event.target as Node)) setTeamMenu(false);
      if (!accountRef.current?.contains(event.target as Node)) setAccountMenu(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  // Existing work/task entry points still use openWorkbench; route them to the shared desk.
  useEffect(() => {
    if (!state.isWorkbenchOpen || !selectedEmployeeId || !team) return;
    const member = team.employees.find(item => item.id === selectedEmployeeId);
    if (!member) return;
    const requested = state.workbenchTabId;
    const session = workbenchTabs(member, team).find(tab => tab.id === requested);
    const page = requested === 'settings' ? settingPage : { id: requested, kind: 'session' as const, sessionId: requested, title: session?.title ?? '私聊' };
    mutateDesk(value => openPage(value, page), deskKey(team.id, member.id), true);
    if (!sharedView) setTopology('roundTable'); setViewMode('eyeLevel'); setFocusedId(member.id);
    state.closeWorkbench();
  }, [state.isWorkbenchOpen, state.workbenchTabId, selectedEmployeeId, team]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (
        (event.key.toLowerCase() === 't' && !event.shiftKey) ||
        event.key.toLowerCase() === 'n'
      )) {
        event.preventDefault();
        setTeamMenu(false); setAccountMenu(false);
        if (event.key.toLowerCase() === 't') { if (!sharedView) setTopology('roundTable'); newPage(); }
        else if (event.shiftKey) setCreateTeamOpen(true);
        else if (team) setAddEmployeeOpen(true);
        return;
      }
      if (event.key === 'Escape') { setTeamMenu(false); setAccountMenu(false); return; }
      const target = event.target as HTMLElement;
      if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey || topology !== 'roundTable' || teamMenu || accountMenu || target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [data-native-tab]')) return;
      if (!team?.employees.length) return;
      event.preventDefault();
      const index = team.employees.findIndex(item => item.id === selectedEmployeeId);
      const next = (index + (event.shiftKey ? -1 : 1) + team.employees.length) % team.employees.length;
      focusEmployee(team.employees[next].id);
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  useEffect(() => {
    const close = (event: Event) => {
      if (!sharedView || state.isRuntimeProfileOpen || state.isAddEmployeeOpen || state.isCreateTeamOpen) return;
      if (teamMenu || accountMenu) { event.preventDefault(); setTeamMenu(false); setAccountMenu(false); }
      else if (active) { event.preventDefault(); mutateDesk(value => closePage(value, active.id)); }
      else if (expanded) { event.preventDefault(); setExpanded(false); }
    };
    window.addEventListener('wework:close-current-layer', close);
    return () => window.removeEventListener('wework:close-current-layer', close);
  });
  const brand = <div className="workspace-brand"><span data-wework-brand-target><WeWorkLogoMark size={30} /></span><span><strong>{product.shortName}</strong><small>{product.tagline}</small></span></div>;
  const chooser = <div className="workspace-chooser"><h2>打开一个页面</h2><p>{employee ? `${employee.displayName} 的会话与工作` : `${team?.name ?? '团队'} 的协作页面`}</p>
    {employee && team ? <>{workbenchTabs(employee, team).map(tab => <button type="button" key={tab.id} onClick={() => choose({ id: tab.id, kind: 'session', sessionId: tab.id, title: tab.title })}><span>{tab.title}</span><small>{tab.id === 'private' ? '继续已有私聊，与任务独立' : tab.id === 'group' ? '助手参与的群聊' : '任务会话与历史记录'}</small></button>)}<button type="button" onClick={() => choose(settingPage)}>助手设置<small>执行器、模型、技能与职责</small></button><button type="button" onClick={() => choose({ id: 'details', kind: 'details', title: '工作与产出' })}>工作与产出<small>队列、上下文和交付物</small></button></> : <>{[{ id: 'overview', kind: 'overview', title: '团队概览' }, { id: 'members', kind: 'members', title: '成员职责' }, { id: 'performance', kind: 'performance', title: '绩效考核' }, { id: 'service', kind: 'service', title: '服务受理' }, { id: 'group', kind: 'group', title: '团队群聊' }, { id: 'pending', kind: 'pending', title: '待办工作' }, { id: 'teamSettings', kind: 'teamSettings', title: '团队设置' }].map(page => <button type="button" key={page.id} onClick={() => choose(page as WorkspacePage)}>{page.title}</button>)}</>}
  </div>;

  return <WorkspacePanelContext.Provider value={{ target: inspectorTarget, openInspector, closeInspector }}><div className="main-workspace" data-platform={platform} data-desktop={Boolean(window.weworkHost)}>
    <header className="workspace-topbar">
      {platform === 'windows' && brand}
      <div ref={teamMenuRef} className="workspace-team-control">
        <button type="button" className="workspace-team-capsule" aria-expanded={teamMenu} aria-label="选择协作团队" onClick={() => setTeamMenu(value => !value)}><span className="workspace-team-dot" /><span><strong>{team?.name ?? '选择团队'}</strong><small>{team?.employees.length ?? 0} 位助手</small></span><ChevronDown size={16} /></button>
        {teamMenu && <div className="workspace-menu" role="menu">{teams.map(item => <button type="button" role="menuitem" key={item.id} onClick={() => { state.selectTeam(item.id); setTeamMenu(false); }}>{item.name}{item.id === selectedTeamId ? ' ✓' : ''}</button>)}<button type="button" role="menuitem" onClick={() => { setCreateTeamOpen(true); setTeamMenu(false); }}>＋ 新建团队 <kbd>{chord}⇧N</kbd></button><button type="button" role="menuitem" disabled={!team} onClick={() => { const name = window.prompt('团队名称', team?.name); if (name?.trim() && team) void state.renameTeam(team.id, name.trim()); setTeamMenu(false); }}>修改团队名称</button>{state.archivedTeams.map(item => <div key={item.id} className="workspace-archived"><span>{item.name} · 已归档</span><button type="button" onClick={() => void state.restoreTeam(item.id)}>恢复</button><button type="button" onClick={() => { if (window.confirm(`永久删除已归档团队“${item.name}”？此操作不可撤销。`)) void state.deleteTeam(item.id); }}>删除</button></div>)}</div>}
      </div>
      <div className="workspace-navigation">{navigation}</div>
      {sharedView && !hasPages && <button type="button" className="workspace-open-page" title={`新建页面 ${chord}T`} aria-label="新建页面" onClick={newPage}><Plus size={18} /></button>}
    </header>
    {state.operationNotice && <OperationNotice message={state.operationNotice.message} onDismiss={state.dismissError} />}
    {!sharedView ? <main className="workspace-other-view">{children}</main> : <main ref={layoutRef} className="workspace-columns" data-expanded={expanded} data-panel-open={hasPages} data-resizing={resizing} style={{ '--content-ratio': `${ratio * 100}%` } as CSSProperties}>
      <div className="workspace-stage-area" data-canvas={topology} aria-hidden={expanded} inert={expanded}>
        <div className="workspace-roundtable-surface" hidden={topology !== 'roundTable'}>{team ? <WeWorkStage3D hideAddSeat employees={team.employees} deliveries={team.collaborationDeliveries} mode={viewMode} selectedEmployeeId={selectedEmployeeId} onModeChange={setViewMode} onSelectEmployee={selectEmployee} onOpenEmployee={() => selectedEmployeeId && focusEmployee(selectedEmployeeId)} onFocusSettled={focusSettled} onAddEmployee={() => setAddEmployeeOpen(true)} draggedWork={team.pendingWorks.find(work => work.id === state.draggingWorkItemId)} onAssignWork={(work, member) => state.dispatchWorkToEmployee(work.id, member.id)} /> : <div className="workspace-chooser"><h2>创建你的第一个团队</h2><button type="button" onClick={() => setCreateTeamOpen(true)}>新建团队</button></div>}
        <div className="workspace-stage-actions"><button type="button" onClick={() => openTeamPage({ id: 'overview', kind: 'overview', title: '团队概览' })}><Users size={15} />团队概览</button><button type="button" disabled={!team} onClick={() => setAddEmployeeOpen(true)}>新建助手 <kbd>{chord}N</kbd></button></div>
        </div><div className="workspace-canvas-surface" hidden={topology !== 'workflowDag'}>{children}</div>
      </div>
      {expanded && <nav className="workspace-employee-rail" aria-label="切换团队或助手"><button type="button" aria-label="团队页面" aria-current={!employee ? 'page' : undefined} onClick={showTeam}><Users size={22} /><small>团队</small></button>{team?.employees.map(member => <button type="button" key={member.id} aria-label={member.displayName} aria-current={employee?.id === member.id ? 'page' : undefined} onClick={() => focusEmployee(member.id)}><EmployeeBotAvatar size={40} bodyColor={member.color} status={member.status} /><small>{member.displayName}</small></button>)}<button type="button" aria-label="新建助手" onClick={() => setAddEmployeeOpen(true)}><Plus size={20} /></button></nav>}
      {hasPages && !expanded && <div role="separator" tabIndex={0} data-native-tab aria-label="调整内容栏宽度" aria-orientation="vertical" aria-valuemin={33} aria-valuemax={50} aria-valuenow={Math.round(ratio * 100)} className="workspace-splitter" onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setRatio(value => clampRatio(value + (event.key === 'ArrowLeft' ? 0.02 : -0.02))); } }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }} onPointerMove={event => { if (!resizing || !layoutRef.current) return; const rect = layoutRef.current.getBoundingClientRect(); setRatio(clampRatio((rect.right - event.clientX) / rect.width)); }} onPointerUp={() => setResizing(false)} onPointerCancel={() => setResizing(false)} />}
      <section className="workspace-content-card" hidden={!hasPages} aria-label={employee ? `${employee.displayName} 的页面` : '团队页面'}>
        <div className="workspace-pagebar"><div ref={tabsRef} role="tablist" aria-label={employee ? '助手页面' : '团队页面'}>{desk.pages.map(page => <div className="workspace-tab" key={page.id} data-active={page.id === desk.active}><button type="button" role="tab" aria-selected={page.id === desk.active} onClick={() => mutateDesk(value => ({ ...value, active: page.id }))}>{page.title}</button><button type="button" aria-label={`关闭 ${page.title}`} onClick={() => mutateDesk(value => closePage(value, page.id))}><X size={13} /></button></div>)}</div><button type="button" title={`新建页面 ${chord}T`} aria-label="新建页面" onClick={newPage}><Plus size={18} /></button><button type="button" title={expanded ? '恢复圆桌布局' : '展开内容区域'} aria-label={expanded ? '恢复圆桌布局' : '展开内容区域'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div>
        <div className="workspace-page-content">
          <div ref={setInspectorTarget} className="workspace-inspector-page" hidden={active?.kind !== 'nodeConfig'}><p className="workspace-inspector-empty">在工作流中选择节点以查看配置。</p></div>
          {!active || active.kind === 'blank' ? chooser : null}
          {active?.kind === 'session' && employee && <EmployeeWorkbench embedded employeeId={employee.id} pageId={active.sessionId} onSettings={() => choose(settingPage)} />}
          {active?.kind === 'details' && employee && <EmployeeWorkbench embedded employeeId={employee.id} content="details" pageId="private" onSettings={() => choose(settingPage)} />}
          {team && (active?.kind === 'members' || active?.kind === 'performance' || active?.kind === 'service') && <TeamManagementPage key={`${team.id}:${active.kind}`} section={active.kind} />}
          {active?.kind === 'group' && team && <SidebarTeamChat key={team.id} team={team} />}
          {active?.kind === 'pending' && <PendingWorkBar key={selectedTeamId} embedded pageOnly onEmbeddedClose={() => mutateDesk(value => closePage(value, active.id))} />}
          {active?.kind === 'overview' && team && <div className="workspace-overview"><p className="workspace-eyebrow">团队概览</p><h2>{team.name}</h2><p>{team.description || '选择助手开展协作，或打开团队群聊与待办工作。'}</p><div className="workspace-overview-links">{([{ id: 'members', kind: 'members', title: '成员职责' }, { id: 'performance', kind: 'performance', title: '绩效考核' }, { id: 'service', kind: 'service', title: '服务受理' }] as WorkspacePage[]).map(page => <button type="button" key={page.id} onClick={() => choose(page)}>{page.title}</button>)}<button type="button" onClick={() => choose({ id: 'group', kind: 'group', title: '团队群聊' })}>团队群聊</button><button type="button" onClick={() => choose({ id: 'pending', kind: 'pending', title: '待办工作' })}>待办工作 · {team.pendingWorks.length}</button><button type="button" onClick={() => choose({ id: 'teamSettings', kind: 'teamSettings', title: '团队设置' })}>团队设置</button></div><h3>成员</h3>{team.employees.map(member => <button className="workspace-member-row" type="button" key={member.id} onClick={() => focusEmployee(member.id)}><EmployeeBotAvatar size={38} bodyColor={member.color} status={member.status} /><span><strong>{member.displayName}</strong><small>{member.roleName || '待配置职责'}</small></span><small>{member.activeSession.execution ? '打开会话' : '待配置'}</small></button>)}<button type="button" className="workspace-add-member" onClick={() => setAddEmployeeOpen(true)}>＋ 新建助手 <kbd>{chord}N</kbd></button></div>}
          {team?.employees.filter(member => (desks[deskKey(team.id, member.id)]?.pages ?? []).some(page => page.kind === 'settings')).map(member => <div className="workspace-settings-page" hidden={active?.kind !== 'settings' || employee?.id !== member.id} key={member.id}><EmployeeConfigDialog embedded employee={member} team={team} onClose={() => choose(privatePage)} /></div>)}
          {team && (desks[deskKey(team.id)]?.pages ?? []).some(page => page.kind === 'teamSettings') && <div className="workspace-team-settings" hidden={active?.kind !== 'teamSettings'}><TeamSettingsView team={team} /></div>}
        </div>
      </section>
    </main>}
    <footer className="workspace-bottom"><div className="workspace-account-area">{platform !== 'windows' && brand}<div ref={accountRef} className="workspace-account-control"><button type="button" className="workspace-account-capsule" aria-expanded={accountMenu} onClick={() => setAccountMenu(value => !value)}><span className="workspace-account-avatar"><UserRound size={19} /></span><span><strong>本地工作台</strong><small>设置与诊断</small></span><Settings2 size={16} /></button>{accountMenu && <div className="workspace-menu" role="menu"><button type="button" onClick={() => { state.setRuntimeProfileOpen(true, undefined, 'general'); setAccountMenu(false); }}>平台设置</button><button type="button" onClick={() => { state.setRuntimeProfileOpen(true, undefined, 'execution'); setAccountMenu(false); }}>执行器与模型</button><button type="button" onClick={() => { openTeamPage({ id: 'members', kind: 'members', title: '成员职责' }); setAccountMenu(false); }}>团队与助手管理</button><button type="button" onClick={() => { onOpenMonitor(); setAccountMenu(false); }}>运行监控</button></div>}</div></div><small className="workspace-keyboard-hint">Tab / Shift+Tab 切换助手 · {chord}T 新页面 · {chord}N 新助手 · {chord}⇧N 新团队</small></footer>
  </div></WorkspacePanelContext.Provider>;
}
