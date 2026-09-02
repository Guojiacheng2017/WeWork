import React from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { ArchiveRestore, BarChart3, BriefcaseBusiness, ChevronRight, Cpu, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Trash2, UserRound, Users } from 'lucide-react';
import { WeWorkLogoMark } from '../employee/EmployeeBotIntro';
import { performancePages, servicePages, type PortalPage } from '../../domain/portalNavigation';

type TeamSidebarProps = { collapsed: boolean; onToggle: () => void; activePortalPage: PortalPage | null; onPortalNavigate: (page: PortalPage | null) => void };

export const TeamSidebar: React.FC<TeamSidebarProps> = ({ collapsed, onToggle, activePortalPage, onPortalNavigate }) => {
  const { teams, archivedTeams, selectedTeamId, selectTeam, setCreateTeamOpen, setRuntimeProfileOpen, setTopology, restoreTeam, deleteTeam } = useWeWorkStore();

  return (
    <aside aria-label="团队侧边栏" data-collapsed={collapsed} className={`${collapsed ? 'w-[64px]' : 'w-[240px]'} relative h-full bg-white border-r border-slate-200/90 flex flex-col select-none shrink-0 z-10 shadow-xs transition-[width] duration-200 ease-out`}>
      <button type="button" onClick={onToggle} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} title={collapsed ? '展开侧边栏' : '收起侧边栏'} className="absolute -right-3 top-4 z-20 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700">
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
      {/* App Brand Header */}
      <div className={`border-b border-slate-100 flex items-center ${collapsed ? 'justify-center px-2 py-4' : 'gap-2.5 p-4 pr-7'}`}>
        <div className="w-8 h-8 shrink-0 flex items-center justify-center" data-wework-brand-target>
          <WeWorkLogoMark size={32} />
        </div>
        {!collapsed && <div className="min-w-0 flex-1">
          <h1 className="text-[13px] font-bold leading-tight text-slate-900">WeWork</h1>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">工作平台</p>
        </div>}
      </div>

      {/* Action: New Team */}
      <div className={collapsed ? 'px-2 py-3' : 'p-3'}>
        <button
          onClick={() => setCreateTeamOpen(true)}
          aria-label="新建协同团队"
          title={collapsed ? '新建协同团队' : undefined}
          className={`w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer ${collapsed ? 'h-10 px-0' : 'py-2 px-3'}`}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          {!collapsed && <span>新建协同团队</span>}
        </button>
      </div>

      {/* Team Navigation List */}
      <div className={`flex-1 overflow-y-auto py-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        <button type="button" onClick={() => onPortalNavigate(null)} title={collapsed ? '协同工作台' : undefined} className={`flex w-full items-center rounded-lg text-xs font-semibold transition-colors ${collapsed ? 'h-10 justify-center' : 'gap-2 px-2 py-2'} ${activePortalPage === null ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Users className="h-4 w-4" />{!collapsed && <span>协同工作台</span>}</button>
        {collapsed ? <><button type="button" onClick={() => onPortalNavigate('businessPerformance')} title="团队绩效考核" className={`grid h-10 w-full place-items-center rounded-lg ${activePortalPage && performancePages.some((item) => item.id === activePortalPage) ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 className="h-4 w-4" /></button><button type="button" onClick={() => onPortalNavigate('businessBreakdown')} title="服务受理" className={`grid h-10 w-full place-items-center rounded-lg ${activePortalPage && servicePages.some((item) => item.id === activePortalPage) ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'}`}><BriefcaseBusiness className="h-4 w-4" /></button></> : <><PortalGroup icon={<BarChart3 className="h-4 w-4" />} label="团队绩效考核" items={performancePages} activePage={activePortalPage} onNavigate={onPortalNavigate} /><PortalGroup icon={<BriefcaseBusiness className="h-4 w-4" />} label="服务受理" items={servicePages} activePage={activePortalPage} onNavigate={onPortalNavigate} /><div className="my-3 h-px bg-slate-100" /></>}
        {!collapsed && <div className="px-2 py-1.5 text-[11px] font-bold text-slate-400 tracking-wider">
          协作团队 ({teams.length})
        </div>}

        {teams.map((team) => {
          const isSelected = team.id === selectedTeamId;

          return (
            <button
              key={team.id}
              onClick={() => { selectTeam(team.id); onPortalNavigate(null); }}
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

                <span className="text-[10px] text-slate-400 font-medium">
                  {team.employees.length} 名在席
                </span>
              </div></>}
            </button>
          );
        })}
        {!collapsed && archivedTeams.length > 0 && <details className="pt-3"><summary className="cursor-pointer px-2 py-1.5 text-[11px] font-bold text-slate-400">已归档团队 ({archivedTeams.length})</summary><div className="mt-1 space-y-1">{archivedTeams.map((team) => <div key={team.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2"><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600">{team.name}</span><button type="button" aria-label={`恢复团队 ${team.name}`} title="恢复团队" onClick={() => void restoreTeam(team.id)} className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-white hover:text-emerald-600"><ArchiveRestore className="h-3.5 w-3.5" /></button><button type="button" aria-label={`永久删除团队 ${team.name}`} title="永久删除团队" onClick={() => { if (window.confirm(`永久删除团队“${team.name}”及其平台记录？团队 Workspace 将保留。此操作不可撤销。`)) void deleteTeam(team.id); }} className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-white hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></details>}
      </div>

      <details className={`group relative border-t border-slate-100 [&>summary::-webkit-details-marker]:hidden ${collapsed ? 'p-2' : 'p-3'}`}>
        <summary aria-label="本地用户与设置" title={collapsed ? '本地用户与设置' : undefined} className={`flex cursor-pointer list-none items-center rounded-xl transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${collapsed ? 'justify-center p-1' : 'gap-2.5 p-2'}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><UserRound className="h-4 w-4" /></span>
          {!collapsed && <><span className="min-w-0 flex-1 text-left"><strong className="block truncate text-xs text-slate-800">本地用户</strong><small className="block truncate text-[10px] text-slate-400">账户与设置</small></span><Settings2 className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-45" /></>}
        </summary>
        <div className={`absolute bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ${collapsed ? 'left-2 w-52' : 'left-3 right-3'}`}>
          <div className="px-2.5 pb-1 pt-1.5"><strong className="block text-xs text-slate-700">本地用户</strong><span className="text-[10px] text-slate-400">WeWork · 本地模式</span></div>
          <button type="button" onClick={(event) => { setRuntimeProfileOpen(true, undefined, 'general'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Settings2 className="h-4 w-4 text-slate-400" /><span className="flex-1">设置</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></button>
          <button type="button" onClick={(event) => { setRuntimeProfileOpen(true, undefined, 'execution'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Cpu className="h-4 w-4 text-slate-400" /><span className="flex-1">执行器与模型</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></button>
          <button type="button" onClick={(event) => { setTopology('teamManagement'); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4 text-slate-400" /><span className="flex-1">团队与助手</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></button>
          <div className="mx-2 my-1 h-px bg-slate-100" />
          <div className="flex items-center gap-2 px-2.5 py-2 text-[10px] text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />本地模式</div>
        </div>
      </details>
    </aside>
  );
};

const PortalGroup: React.FC<{ icon: React.ReactNode; label: string; items: { id: PortalPage; label: string }[]; activePage: PortalPage | null; onNavigate: (page: PortalPage) => void }> = ({ icon, label, items, activePage, onNavigate }) => <details open className="group [&>summary::-webkit-details-marker]:hidden"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{icon}<span className="flex-1">{label}</span><ChevronRight className="h-3.5 w-3.5 rotate-90 text-slate-300" /></summary><div className="ml-4 border-l border-slate-200 pl-2">{items.map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className={`block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-semibold transition-colors ${activePage === item.id ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{item.label}</button>)}</div></details>;
