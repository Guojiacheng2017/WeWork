import { Button } from '../ui';
import React, { useEffect, useRef, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { Activity, Archive, ArchiveRestore, ChevronRight, Cpu, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Trash2, UserRound, Users } from 'lucide-react';
import { WeWorkLogoMark } from '../employee/EmployeeBotIntro';
import type { PortalPage } from '../../domain/portalNavigation';

type TeamSidebarProps = { collapsed: boolean; onToggle: () => void; activePortalPage: PortalPage | null; onPortalNavigate: (page: PortalPage | null) => void; onOpenMonitor: () => void };

export const TeamSidebar: React.FC<TeamSidebarProps> = ({ collapsed, onToggle, onPortalNavigate, onOpenMonitor }) => {
  const { teams, archivedTeams, selectedTeamId, selectTeam, setCreateTeamOpen, setRuntimeProfileOpen, setTopology, archiveTeam, restoreTeam, deleteTeam } = useWeWorkStore();
  const accountRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => { if (!accountRef.current?.contains(event.target as Node)) accountRef.current?.removeAttribute('open'); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') accountRef.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', close); document.addEventListener('focusin', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('focusin', close); document.removeEventListener('keydown', escape); };
  }, []);
  const [menu, setMenu] = useState<{ teamId: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('scroll', close, true); };
  }, [menu]);

  return (
    <aside aria-label="团队侧边栏" data-collapsed={collapsed} className={`${collapsed ? 'w-[64px]' : 'w-[240px]'} relative h-full bg-white border-r border-slate-200/90 flex flex-col select-none shrink-0 z-10 shadow-xs transition-[width] duration-200 ease-out motion-reduce:transition-none`}>
      <div className="wework-window-controls">
        <Button type="button" onClick={onToggle} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>
      {/* App Brand Header */}
      <div className={`border-b border-slate-100 flex items-center ${collapsed ? 'flex-col justify-center gap-2 px-2 py-3' : 'gap-2.5 p-4 pr-7'}`}>
        <div className="w-8 h-8 shrink-0 flex items-center justify-center" data-wework-brand-target>
          <WeWorkLogoMark size={32} />
        </div>
        {!collapsed && <div className="min-w-0 flex-1">
          <h1 className="text-[13px] font-bold leading-tight text-slate-900">WeWork</h1>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">工作平台</p>
        </div>}
        <Button type="button" onClick={onToggle} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} title={collapsed ? '展开侧边栏' : '收起侧边栏'} className={`wework-brand-toggle grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 ${collapsed?'bg-white ring-1 ring-slate-200':''}`}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Action: New Team */}
      <div className={collapsed ? 'px-2 py-3' : 'p-3'}>
        <Button
          onClick={() => setCreateTeamOpen(true)}
          aria-label="新建协同团队"
          title={collapsed ? '新建协同团队' : undefined}
          className={`w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer ${collapsed ? 'h-10 px-0' : 'py-2 px-3'}`}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          {!collapsed && <span>新建协同团队</span>}
        </Button>
      </div>

      {/* Team Navigation List */}
      <div className={`flex-1 overflow-y-auto py-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && <div className="px-2 py-1.5 text-[11px] font-bold text-slate-400 tracking-wider">
          协作团队 ({teams.length})
        </div>}

        {teams.map((team) => {
          const isSelected = team.id === selectedTeamId;

          return (
            <Button
              key={team.id}
              onClick={() => { selectTeam(team.id); onPortalNavigate(null); }}
              onContextMenu={(event) => { event.preventDefault(); setMenu({ teamId: team.id, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 150) }); }}
              aria-label={team.name}
              title={collapsed ? team.name : undefined}
              className={`w-full text-left rounded-lg transition-all cursor-pointer border ${collapsed ? 'grid h-10 place-items-center p-1.5' : 'p-2.5'} ${
                isSelected
                  ? 'bg-rose-50/60 border-rose-200/90 text-slate-900 shadow-xs ring-1 ring-rose-500/10'
                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
              }`}
            >
              {collapsed ? <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-600 shadow-sm"><Users className="h-4 w-4" /><span className="absolute -bottom-1 flex -space-x-1">{team.employees.slice(0, 3).map((employee) => <span key={employee.id} className="h-2 w-2 rounded-full border border-white" style={{ backgroundColor: employee.color }} />)}</span>{isSelected && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-rose-600" />}</span> : <><div className="flex items-center justify-between">
                <span className="text-xs font-bold truncate">{team.name}</span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                )}
              </div>

              {/* Employee Avatars Color Dots */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/80">
                <div className="flex items-center -space-x-1.5 overflow-hidden">
                  {team.employees.slice(0, 4).map((employee) => (
                    <div
                      key={employee.id}
                      className="w-4 h-4 rounded-full border-1.5 border-white shadow-xs"
                      style={{ backgroundColor: employee.color }}
                      title={`${employee.displayName} (${employee.roleName})`}
                    />
                  ))}
                  {team.employees.length > 4 && (
                    <div className="w-4 h-4 rounded-full bg-slate-200 border-1.5 border-white flex items-center justify-center text-[8px] font-bold text-slate-600">
                      +{team.employees.length - 4}
                    </div>
                  )}
                </div>

                <span className="text-[11px] text-slate-400 font-medium">
                  {team.employees.length} 名在席
                </span>
              </div></>}
            </Button>
          );
        })}
        {!collapsed && archivedTeams.length > 0 && <details className="pt-3"><summary className="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-slate-400">已归档团队 ({archivedTeams.length})</summary><div className="mt-1 space-y-1">{archivedTeams.map((team) => <div key={team.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2"><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600">{team.name}</span><button type="button" aria-label={`恢复团队 ${team.name}`} title="恢复团队" onClick={() => void restoreTeam(team.id)} className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-white hover:text-emerald-600"><ArchiveRestore className="h-3.5 w-3.5" /></button><button type="button" aria-label={`永久删除团队 ${team.name}`} title="永久删除团队" onClick={() => { if (window.confirm(`永久删除团队“${team.name}”及其平台记录？团队 Workspace 将保留。此操作不可撤销。`)) void deleteTeam(team.id); }} className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-white hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></details>}
      </div>

      {menu && <div role="menu" aria-label="团队操作" onPointerDown={(event)=>event.stopPropagation()} className="fixed z-[100] w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" style={{left:menu.x,top:menu.y}}>
        <Button role="menuitem" type="button" onClick={()=>{selectTeam(menu.teamId);onPortalNavigate(null);setMenu(null);}} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 text-sky-500"/>打开团队</Button>
        <Button role="menuitem" type="button" onClick={()=>{selectTeam(menu.teamId);onPortalNavigate(null);setTopology('teamManagement');setMenu(null);}} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Settings2 className="h-4 w-4 text-violet-500"/>团队管理</Button>
        <div className="mx-2 my-1 h-px bg-slate-100"/>
        <Button role="menuitem" type="button" onClick={()=>{const team=teams.find(value=>value.id===menu.teamId);setMenu(null);if(team&&window.confirm(`归档团队“${team.name}”？之后可从已归档团队中恢复。`))void archiveTeam(team.id);}} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50"><Archive className="h-4 w-4"/>归档团队</Button>
      </div>}

      <details ref={accountRef} className={`ww-account group relative border-t border-slate-100 [&>summary::-webkit-details-marker]:hidden ${collapsed ? 'p-2' : 'p-3'}`}>
        <summary aria-label="本地用户与设置" title={collapsed ? '本地用户与设置' : undefined} className={`ww-account-trigger flex cursor-pointer list-none items-center rounded-xl transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${collapsed ? 'justify-center p-1' : 'gap-2.5 p-2'}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><UserRound className="h-4 w-4" /></span>
          {!collapsed && <><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-xs text-slate-800">本地用户</strong><small className="block truncate text-[11px] text-slate-400">账户与设置</small></span><Settings2 className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-45" /></>}
        </summary>
        <div className={`ww-account-menu absolute bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ${collapsed ? 'left-2 w-52' : 'left-3 right-3'}`}>
          <div className="ww-account-heading"><span className="ww-account-avatar"><UserRound size={18} /></span><div><strong>本地用户</strong><span>此设备上的工作平台</span></div><span className="ww-account-status" title="本地模式" /></div>
          <Button type="button" onClick={(event) => { setRuntimeProfileOpen(true, undefined, 'general'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Settings2 className="h-4 w-4 text-slate-400" /><span className="flex-1">平台设置</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></Button>
          <Button type="button" onClick={(event) => { setRuntimeProfileOpen(true, undefined, 'execution'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Cpu className="h-4 w-4 text-slate-400" /><span className="flex-1">执行器与模型</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></Button>
          <Button type="button" onClick={(event) => { onPortalNavigate(null); setTopology('teamManagement'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 text-slate-400" /><span className="flex-1">团队与助手</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></Button>
          {window.weworkHost && <Button type="button" onClick={(event) => { onOpenMonitor(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Activity className="h-4 w-4 text-slate-400" /><span className="flex-1">运行监控台</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></Button>}
          <div className="mx-2 my-1 h-px bg-slate-100" />
          <div className="ww-account-footer">偏好与配置保存在此设备</div>
        </div>
      </details>
    </aside>
  );
};
