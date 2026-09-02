import { ChevronDown, FileText, GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { WorkItem } from '../../domain/wework';

export function PendingWorkBar({ embedded = false, onEmbeddedClose }: { embedded?: boolean; onEmbeddedClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', goal: '', priority: 'medium' as WorkItem['priority'], category: 'Digital' as WorkItem['category'], runtimeProfileId: '' });
  const { teams, runtimeProfiles, selectedTeamId, setDraggingWorkItemId, setDragHoveredEmployeeId, createWorkItem, cancelWork } = useWeWorkStore();
  const works = teams.find((team) => team.id === selectedTeamId)?.pendingWorks ?? [];

  if (!open && !embedded) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="absolute right-5 top-4 z-20 flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white/95 px-4 text-xs font-bold text-slate-800 shadow-lg backdrop-blur hover:border-rose-200">
        <FileText className="h-4 w-4 text-rose-600" />
        <span>待办公文与任务</span>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{works.length}</span>
        <span className="text-[10px] font-normal text-slate-400">可拖拽派发</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
    );
  }

  if (!open && embedded) {
    return <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full items-center justify-center gap-2 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"><FileText className="h-4 w-4 text-rose-500" />展开待办公文与任务<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">{works.length}</span></button>;
  }

  return (
    <aside className={embedded
      ? 'pending-work-drawer relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]'
      : 'pending-work-drawer absolute bottom-4 right-4 top-4 z-30 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]'}>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div><h3 className="text-sm font-bold text-slate-900">待办公文与任务</h3><p className="mt-0.5 text-[11px] text-slate-400">拖动卡片到助手或流程节点</p></div>
        <div className="flex items-center gap-1"><button type="button" aria-label="新建待办" onClick={() => setCreating(true)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><Plus className="h-4 w-4" /></button><button type="button" aria-label="收起待办" onClick={() => embedded && onEmbeddedClose ? onEmbeddedClose() : setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      </header>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {works.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div><FileText className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-500">当前没有待派发工作</p><p className="mt-1 text-[11px] text-slate-400">已派发事项可在助手工作台查看</p></div>
          </div>
        )}
        {works.map((work) => (
          <article
            key={work.id}
            draggable
            onDragStart={(event) => { event.dataTransfer.setData('text/plain', work.id); event.dataTransfer.effectAllowed = 'move'; setDraggingWorkItemId(work.id); }}
            onDragEnd={() => { setDraggingWorkItemId(null); setDragHoveredEmployeeId(null); }}
            onClick={() => setSelectedWork(work)}
            className="group cursor-grab rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm hover:border-rose-300 hover:shadow-md"
          >
            <div className="flex items-start gap-2.5">
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2"><span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{work.category === 'Paperwork' ? '公文' : '工单'}</span>{work.priority === 'high' && <span className="text-[10px] font-semibold text-rose-600">紧急</span>}<time className="ml-auto text-[10px] text-slate-400">{work.createdAt}</time></div>
                <h4 className="text-xs font-bold leading-5 text-slate-900">{work.title}</h4>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{work.goal}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      {(selectedWork || creating) && <div className="absolute inset-0 z-10 bg-white p-5">
        <div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase text-rose-600">{creating ? 'New work' : selectedWork?.category}</p><h4 className="mt-1 text-sm font-bold text-slate-900">{creating ? '新建待办工作' : selectedWork?.title}</h4></div><button type="button" aria-label="关闭待办详情" onClick={() => { setSelectedWork(null); setCreating(false); }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        {creating ? <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim() || !draft.goal.trim()) return; createWorkItem({ ...draft, runtimeProfileId: draft.runtimeProfileId || undefined }); setDraft({ title: '', goal: '', priority: 'medium', category: 'Digital', runtimeProfileId: '' }); setCreating(false); }}>
          <label className="block text-[11px] font-semibold text-slate-600">标题<input name="work-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-rose-400" required /></label>
          <label className="block text-[11px] font-semibold text-slate-600">目标<textarea name="work-goal" value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} className="mt-1.5 min-h-24 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-rose-400" required /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-slate-600">形式<select name="work-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as WorkItem['category'] })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="Digital">Digital Work</option><option value="Paperwork">Paperwork</option></select></label><label className="text-[11px] font-semibold text-slate-600">优先级<select name="work-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WorkItem['priority'] })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="low">低</option><option value="medium">普通</option><option value="high">紧急</option></select></label></div>
          <label className="block text-[11px] font-semibold text-slate-600">执行配置（可选覆盖）<select aria-label="任务执行配置" value={draft.runtimeProfileId} onChange={(event) => setDraft({ ...draft, runtimeProfileId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option value="">继承助手 / 团队默认配置</option>{runtimeProfiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <button type="submit" className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800">加入团队待办</button>
        </form> : selectedWork && <div className="mt-5 space-y-4"><div><p className="text-[11px] font-semibold text-slate-400">目标</p><p className="mt-1 text-xs leading-5 text-slate-700">{selectedWork.goal}</p></div>{selectedWork.constraints && <div><p className="text-[11px] font-semibold text-slate-400">约束</p><p className="mt-1 text-xs leading-5 text-slate-700">{selectedWork.constraints}</p></div>}<div className="flex gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-500"><span className="rounded bg-slate-100 px-2 py-1">{selectedWork.priority}</span><span className="rounded bg-slate-100 px-2 py-1">创建于 {selectedWork.createdAt}</span></div><p className="text-[11px] leading-5 text-slate-400">关闭详情后，可将卡片拖到圆桌助手或 DAG 节点完成派发。</p><button type="button" onClick={async () => { if (!window.confirm(`确定取消“${selectedWork.title}”吗？取消后不会回到待办队列。`)) return; await cancelWork(selectedWork.id); setSelectedWork(null); }} className="w-full rounded-lg border border-rose-200 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">取消工作</button></div>}
      </div>}
    </aside>
  );
}
