import { executionBlockerForWork, workflowBlockerMessage } from '../../domain/workflowExecution';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight } from 'lucide-react';
import type { RoleNode, WeWorkTeam, WorkItem } from '../../domain/wework';
import { Button } from '../ui';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import { useReducedEffects } from '../../hooks/useReducedEffects';

export function findParticipationWork(team: WeWorkTeam, id?: string): WorkItem | undefined {
  if (!id) return;
  return [...team.pendingWorks, ...(team.completedWorks ?? []), ...(team.cancelledWorks ?? []), ...team.employees.flatMap(employee => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? []), ...(employee.completedWorkItems ?? [])])].find(work => work?.id === id);
}
const states = { pending: '等待执行', running: '执行中', blocked: '阻塞', completed: '已完成' };
export function ParticipationDetail({ team, node, onBack, onOpen, onOpenWorkflow }: { team: WeWorkTeam; node: RoleNode; onBack: () => void; onOpenWorkflow: (workflowId: string) => void; onOpen: (employeeId: string, workId: string) => void }) {
  const reducedEffects = useReducedEffects();
  const employee = team.employees.find(item => item.id === node.assignedEmployeeId);
  const work = findParticipationWork(team, node.workItemId);
  const execution = team.workflowExecutions?.find(item => item.workflowId === work?.workflowId);
  const blocker = executionBlockerForWork(execution, work?.id);
  const globalBlockers = execution?.blockers.filter(item => !item.workId) ?? [];
  const runs = (team.workflows ?? []).filter(run => !!work && run.workId === work.id && run.id !== work.workflowId);
  const cardRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const transformRef = useRef('none');
  const closeRef = useRef(onBack);
  closeRef.current = onBack;
  const dismiss = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const card = cardRef.current;
    if (!card || reducedEffects) { closeRef.current(); return; }
    card.animate([{ transform: 'none', opacity: 1 }, { transform: transformRef.current, opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(() => closeRef.current()).catch(() => closeRef.current());
  };
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const card = cardRef.current!;
    const source = Array.from(document.querySelectorAll<HTMLElement>('[data-dag-node]')).find(element => element.dataset.dagNode === node.id);
    const origin = source?.getBoundingClientRect();
    const target = card.getBoundingClientRect();
    if (origin && target.width && target.height) {
      transformRef.current = `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})`;
      if (!reducedEffects) card.animate([{ transform: transformRef.current, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    card.focus();
    return () => { previous?.focus({ preventScroll: true }); };
  }, [node.id, reducedEffects]);
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-8 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
  <div ref={cardRef} role="dialog" aria-modal="true" aria-label="助手工作参与详情" tabIndex={-1} style={{ transformOrigin: 'top left' }} className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl outline-none" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4"><strong className="text-sm">任务详情</strong><Button variant="ghost" aria-label="关闭任务卡片" onClick={dismiss}><X size={18} /></Button></header>
    <div className="min-h-0 flex-1 overflow-auto p-6"><div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-4">{employee && <EmployeeBotAvatar size={48} bodyColor={employee.color} status={employee.status} showBadge={false} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-3"><h2 className="truncate text-lg font-semibold">{work?.title ?? node.label}</h2><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{work ? work.cancelledAt ? '已取消' : blocker ? '执行受阻' : work.deliveryStatus === 'submitted' ? '待验收' : work.deliveryStatus === 'changes_requested' ? '需修改' : states[work.status] : node.workItemId ? '引用不可用' : '尚未启动'}</span></div><p className="mt-1 text-sm text-slate-500">{employee?.displayName ?? '待指派助手'} · {employee?.roleName ?? node.roleName}</p></div>{work && employee && <Button onClick={() => onOpen(employee.id, work.id)}>进入工作台<ArrowRight size={14} /></Button>}</div>
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2"><div><h3 className="text-xs font-semibold text-slate-500">工作目标</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{work?.goal ?? node.goal ?? '尚未填写工作目标'}</p></div><div><h3 className="text-xs font-semibold text-slate-500">验收标准</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{work?.acceptanceCriteria ?? '尚未填写验收标准'}</p></div></section>
      {(blocker || globalBlockers.length > 0 || execution && !execution.enabled) && <section aria-label="执行状态" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {execution && !execution.enabled && <p>编排已暂停；已启动的工作可继续，后续推进已暂停。</p>}
        {blocker && <p>{workflowBlockerMessage(blocker)}</p>}
        {blocker?.detail && <p className="mt-2 break-words">原因：{blocker.detail}</p>}
        {globalBlockers.map((item, index) => <p key={index}>{workflowBlockerMessage(item)}</p>)}
      </section>}
      {runs.length > 0 && <section aria-label="关联任务运行图"><h3 className="mb-3 font-semibold">关联图</h3><ul className="space-y-2">{runs.map(run => <li key={run.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4"><span className="text-sm">{run.name}</span><Button onClick={() => onOpenWorkflow(run.id)}>在画布中打开<ArrowRight size={14} /></Button></li>)}</ul></section>}

    </div></div>
  </div></div>, document.body);
}
