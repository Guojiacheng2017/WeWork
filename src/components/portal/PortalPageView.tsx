import React from 'react';
import { Activity, CheckCircle2, CircleDot, Clock3, FileCheck2, Gauge, Target, UserRoundCheck } from 'lucide-react';
import type { WeWorkTeam, WorkItem } from '../../domain/wework';
import { portalPageMeta, servicePages, type PortalPage } from '../../domain/portalNavigation';

const allWorks = (team?: WeWorkTeam) => team ? [
  ...team.pendingWorks, ...(team.completedWorks ?? []),
  ...team.employees.flatMap((employee) => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? [])].filter(Boolean) as WorkItem[]),
] : [];

const StatusPill: React.FC<{ status: WorkItem['status'] }> = ({ status }) => {
  const labels = { pending: '待匹配', running: '执行中', completed: '已完成', blocked: '已阻塞' } as const;
  const tone = status === 'completed' ? 'bg-emerald-50 text-emerald-700' : status === 'running' ? 'bg-sky-50 text-sky-700' : status === 'blocked' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${tone}`}>{labels[status]}</span>;
};

export const PortalPageView: React.FC<{ page: PortalPage; team?: WeWorkTeam }> = ({ page, team }) => {
  const meta = portalPageMeta[page];
  const works = allWorks(team);
  const completed = works.filter((work) => work.status === 'completed');
  const running = works.filter((work) => work.status === 'running');
  const pending = works.filter((work) => work.status === 'pending');
  const isPerformance = meta.group === '团队绩效考核';

  return <div className="h-full overflow-y-auto bg-slate-50 px-6 py-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><p className="mb-1 text-xs font-bold text-rose-700">{meta.group}</p><h2 className="text-2xl font-bold tracking-tight text-slate-900">{meta.title}</h2><p className="mt-2 text-sm text-slate-500">{meta.description}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-right shadow-sm"><span className="block text-[11px] font-bold text-slate-400">当前团队</span><strong className="text-sm text-slate-800">{team?.name ?? '暂无团队'}</strong></div>
      </div>

      {!isPerformance && <div className="mb-6 grid grid-cols-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {servicePages.map((item, index) => <div key={item.id} className={`relative px-3 py-4 text-center ${item.id === page ? 'bg-rose-50 text-rose-700' : 'text-slate-400'}`}><span className={`mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${item.id === page ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span><strong className="text-xs">{item.label}</strong>{index < 4 && <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-slate-200" />}</div>)}
      </div>}

      {page === 'businessPerformance' && <>
        <div className="grid gap-4 md:grid-cols-3"><Metric icon={<Target />} label="任务总量" value={works.length} note="当前团队累计任务" /><Metric icon={<CheckCircle2 />} label="完成任务" value={completed.length} note="形成有效交付" /><Metric icon={<Gauge />} label="业务完成率" value={`${works.length ? Math.round(completed.length / works.length * 100) : 0}%`} note="按任务数量计算" /></div>
        <Section title="业务交付概览"><WorkTable works={works.slice(0, 8)} /></Section>
      </>}

      {page === 'personalPerformance' && <Section title="助手绩效明细"><div className="divide-y divide-slate-100">{team?.employees.map((employee) => { const done = employee.completedWorkItems?.length ?? 0; return <div key={employee.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-4 py-4"><div><strong className="block text-sm text-slate-800">{employee.displayName}</strong><span className="text-xs text-slate-400">{employee.roleName}</span></div><span className="text-xs text-slate-600">{employee.currentWorkItem ? '任务执行中' : '当前空闲'}</span><span className="text-xs text-slate-600">完成 {done} 项</span><span className="text-right text-xs font-bold text-slate-700">{employee.status === 'working' ? '在岗执行' : '在岗待命'}</span></div>}) ?? <Empty />}</div></Section>}

      {page === 'businessBreakdown' && <Section title="待分解业务"><WorkTable works={pending} empty="暂无待分解业务" /></Section>}
      {page === 'taskMatching' && <><div className="grid gap-4 md:grid-cols-3"><Metric icon={<UserRoundCheck />} label="可用助手" value={team?.employees.filter((employee) => !employee.currentWorkItem).length ?? 0} note="当前可承接任务" /><Metric icon={<Clock3 />} label="待匹配任务" value={pending.length} note="等待岗位匹配" /><Metric icon={<CircleDot />} label="在席助手" value={team?.employees.length ?? 0} note="当前团队规模" /></div><Section title="任务匹配队列"><WorkTable works={pending} /></Section></>}
      {page === 'taskExecution' && <Section title="执行中任务"><WorkTable works={running} empty="暂无执行中任务" /></Section>}
      {page === 'taskMonitoring' && <><div className="grid gap-4 md:grid-cols-3"><Metric icon={<Activity />} label="运行中" value={running.length} note="正常执行任务" /><Metric icon={<Clock3 />} label="等待中" value={pending.length} note="待分配或排队" /><Metric icon={<CheckCircle2 />} label="已完成" value={completed.length} note="累计完成任务" /></div><Section title="全量任务监控"><WorkTable works={works} /></Section></>}
      {page === 'taskFeedback' && <Section title="任务交付与反馈"><WorkTable works={completed} empty="暂无已完成任务反馈" /></Section>}
    </div>
  </div>;
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; note: string }> = ({ icon, label, value, note }) => <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-700 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="text-xs font-semibold text-slate-400">{label}</span></div><strong className="text-3xl font-bold text-slate-900">{value}</strong><p className="mt-1 text-xs text-slate-400">{note}</p></div>;
const Section: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-rose-700" /><h3 className="text-sm font-bold text-slate-800">{title}</h3></div>{children}</section>;
const Empty = () => <div className="py-12 text-center text-xs text-slate-400">暂无数据</div>;
const WorkTable: React.FC<{ works: WorkItem[]; empty?: string }> = ({ works, empty = '暂无任务数据' }) => works.length ? <div className="divide-y divide-slate-100">{works.map((work) => <div key={work.id} className="grid grid-cols-[1.5fr_1fr_auto] items-center gap-4 py-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-800">{work.title}</strong><span className="block truncate text-xs text-slate-400">{work.goal}</span></div><span className="text-xs text-slate-500">{work.category}</span><StatusPill status={work.status} /></div>)}</div> : <div className="py-12 text-center text-xs text-slate-400">{empty}</div>;
