import { TeamGroupComposer } from '../team/TeamManagementView';
import { TeamMessage } from '../team/TeamMessage';
import { parseGroupDraft } from '../team/groupDraft';
import type { WeWorkTeam } from '../../domain/wework';
import { Button, Field, Input, NativeSelect, Textarea } from '../ui';
import { ChevronDown, ExternalLink, FileText, GripVertical, MessageCircle, Plus, Settings2, X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { WorkItem } from '../../domain/wework';

interface AuxiliaryDrawer {
  visible: boolean;
  expanded: boolean;
  title: string;
  subtitle: string;
  content: ReactNode;
  onOpen: () => void;
  onClose: () => void;
  onCollapsed?: () => void;
}

export function PendingWorkBar({ embedded = false, initiallyCollapsed = false, onExpandedChange, onEmbeddedClose, onOpenTeamChat, auxiliaryDrawer }: { embedded?: boolean; initiallyCollapsed?: boolean; onExpandedChange?: (expanded: boolean) => void; onEmbeddedClose?: () => void; onOpenTeamChat?: () => void; auxiliaryDrawer?: AuxiliaryDrawer }) {
  const [open, setOpen] = useState(true);
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [tab, setTab] = useState<'work'|'chat'|'auxiliary'|null>(initiallyCollapsed ? null : 'chat');
  const [readMessageCounts, setReadMessageCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState({ title: '', goal: '', priority: 'medium' as WorkItem['priority'], category: 'Digital' as WorkItem['category'], runtimeProfileId: '' });
  const { teams, runtimeProfiles, selectedTeamId, setDraggingWorkItemId, setDragHoveredEmployeeId, createWorkItem, cancelWork, dispatchWorkToEmployee } = useWeWorkStore();
  const team = teams.find((candidate) => candidate.id === selectedTeamId);
  const works = team?.pendingWorks ?? [];
  const messages = team?.teamMessages ?? [];
  const unreadMessages = team ? Math.max(0, messages.length - (readMessageCounts[team.id] ?? 0)) : 0;
  const closeEmbedded=()=>{if(onEmbeddedClose)onEmbeddedClose();else setTab(null);};
  useEffect(()=>{onExpandedChange?.(tab!==null);},[onExpandedChange,tab]);
  useEffect(()=>{if(auxiliaryDrawer?.expanded)setTab('auxiliary');},[auxiliaryDrawer?.expanded]);
  useEffect(()=>{if(tab==='chat'&&team)setReadMessageCounts(counts=>counts[team.id]===messages.length?counts:{...counts,[team.id]:messages.length});},[messages.length,tab,team]);

  if (!open && !embedded) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="absolute right-5 top-4 z-20 flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white/95 px-4 text-xs font-bold text-slate-800 shadow-lg backdrop-blur hover:border-rose-200">
        <FileText className="h-4 w-4 text-rose-600" />
        <span>待办公文与任务</span>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">{works.length}</span>
        <span className="text-[11px] font-normal text-slate-400">可拖拽派发</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Button>
    );
  }

  if (!open && embedded) {
    return <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full items-center justify-center gap-2 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"><FileText className="h-4 w-4 text-rose-500" />展开待办公文与任务<span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">{works.length}</span></button>;
  }

  if (embedded && tab === null) {
    return <nav aria-label="打开协作抽屉" className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-sm backdrop-blur">
      <button type="button" title="打开团队群聊" aria-label={`打开团队群聊，${unreadMessages} 条未读`} onClick={()=>setTab('chat')} className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 outline-none transition hover:bg-sky-50 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-sky-200"><MessageCircle className="h-4 w-4"/>{unreadMessages>0&&<span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-sky-100 px-1 text-[9px] font-semibold leading-4 text-sky-700">{unreadMessages}</span>}</button>
      <button type="button" title="打开待办公文与任务" aria-label={`打开待办公文与任务，${works.length} 项`} onClick={()=>setTab('work')} className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"><FileText className="h-4 w-4"/>{works.length>0&&<span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-rose-100 px-1 text-[9px] font-semibold leading-4 text-rose-700">{works.length}</span>}</button>
      {auxiliaryDrawer?.visible&&<button type="button" title={`打开${auxiliaryDrawer.title}`} aria-label={`打开${auxiliaryDrawer.title}`} onClick={()=>{setTab('auxiliary');auxiliaryDrawer.onOpen();}} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-violet-50 hover:text-violet-700"><Settings2 className="h-4 w-4"/></button>}
    </nav>;
  }

  return (
    <aside className={embedded
      ? 'pending-work-drawer relative flex h-full min-h-0 w-full flex-col gap-2 overflow-visible'
      : 'pending-work-drawer absolute bottom-4 right-4 top-4 z-30 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]'}>
      <div className={`order-0 flex h-16 shrink-0 items-center border border-slate-200 bg-white pr-2 shadow-sm ${tab==='chat'?'rounded-t-2xl border-b-transparent bg-sky-50/60':'rounded-2xl'}`}><button type="button" aria-expanded={tab==='chat'} aria-controls="team-drawer-chat" onClick={()=>setTab('chat')} className="group flex h-full min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-slate-700 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-200"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tab==='chat'?'bg-sky-100 text-sky-700':'bg-slate-100 text-slate-500'}`}><MessageCircle className="h-4 w-4"/></span><span className="min-w-0 flex-1"><strong className="block text-xs">团队群聊</strong><small className="mt-0.5 block text-[10px] font-normal text-slate-400">全员可见 · @ 助手邀请回复</small></span>{tab!=='chat'&&unreadMessages>0&&<span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-600 shadow-sm">{unreadMessages}</span>}<ChevronDown className={`h-4 w-4 transition-transform ${tab==='chat'?'rotate-180':''}`}/></button>{tab==='chat'&&<>{onOpenTeamChat&&<Button variant="ghost" type="button" title="在团队管理中展开群聊" aria-label="在团队管理中展开群聊" onClick={onOpenTeamChat} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"><ExternalLink className="h-4 w-4"/></Button>}<Button variant="ghost" type="button" title="关闭群聊" aria-label="关闭团队群聊抽屉" onClick={closeEmbedded} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"><X className="h-4 w-4"/></Button></>}</div>
      {tab==='chat' && team && <section id="team-drawer-chat" className="order-1 -mt-2 min-h-0 flex-1 overflow-hidden rounded-b-2xl border border-t-0 border-slate-200 bg-white"><SidebarTeamChat team={team} /></section>}
      <div className={`order-2 flex h-16 shrink-0 items-center border border-slate-200 bg-white pr-2 shadow-sm ${tab==='work'?'rounded-t-2xl border-b-transparent bg-rose-50/40':'rounded-2xl'}`}><button type="button" aria-expanded={tab==='work'} aria-controls="team-drawer-work" onClick={()=>setTab('work')} className="group flex h-full min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-slate-700 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tab==='work'?'bg-rose-100 text-rose-700':'bg-slate-100 text-slate-500'}`}><FileText className="h-4 w-4"/></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">待办公文与任务</strong><small className="mt-0.5 block truncate text-[10px] font-normal text-slate-400">拖动卡片到助手或流程节点</small></span><span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">{works.length}</span><ChevronDown className={`h-4 w-4 transition-transform ${tab==='work'?'rotate-180':''}`}/></button>{tab==='work'&&<><Button variant="ghost" type="button" title="新建待办" aria-label="新建待办" onClick={() => setCreating(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-sm hover:border-rose-300 hover:bg-rose-100"><Plus className="h-4 w-4" /></Button><Button variant="ghost" type="button" title="关闭待办" aria-label="关闭待办抽屉" onClick={closeEmbedded} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"><X className="h-4 w-4"/></Button></>}</div>
      {tab==='work'&&<div id="team-drawer-work" className="order-3 -mt-2 flex-1 space-y-2.5 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
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
            onClick={() => { setSelectedWork(work); setAssigneeId(''); }}
            className="group cursor-grab rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm hover:border-rose-300 hover:shadow-md"
          >
            <div className="flex items-start gap-2.5">
              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2"><span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{work.category === 'Paperwork' ? '公文' : '工单'}</span>{work.priority === 'high' && <span className="text-[11px] font-semibold text-rose-600">紧急</span>}<time className="ml-auto text-[11px] text-slate-400">{work.createdAt}</time></div>
                <h4 className="text-xs font-bold leading-5 text-slate-900">{work.title}</h4>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{work.goal}</p>
              </div>
            </div>
          </article>
        ))}
      </div>}
      {tab==='work' && (selectedWork || creating) && <div className={creating ? "absolute inset-x-1 bottom-1 z-10 max-h-[72%] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_-12px_28px_rgba(15,23,42,0.10)]" : "absolute inset-0 z-10 bg-white p-5"}>
        <div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase text-rose-600">{creating ? 'New work' : selectedWork?.category}</p><h4 className="mt-1 text-sm font-bold text-slate-900">{creating ? '新建待办工作' : selectedWork?.title}</h4></div><Button variant="ghost" type="button" aria-label="关闭待办详情" onClick={() => { setSelectedWork(null); setCreating(false); }} className="grid h-8 w-8 place-items-center"><X className="h-4 w-4" /></Button></div>
        {creating ? <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim() || !draft.goal.trim()) return; createWorkItem({ ...draft, runtimeProfileId: draft.runtimeProfileId || undefined }); setDraft({ title: '', goal: '', priority: 'medium', category: 'Digital', runtimeProfileId: '' }); setCreating(false); }}>
          <Field label="标题"><Input name="work-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></Field>
          <Field label="目标"><Textarea name="work-goal" value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} className="min-h-24" required /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="形式"><NativeSelect name="work-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as WorkItem['category'] })}><option value="Digital">Digital Work</option><option value="Paperwork">Paperwork</option></NativeSelect></Field><Field label="优先级"><NativeSelect name="work-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WorkItem['priority'] })}><option value="low">低</option><option value="medium">普通</option><option value="high">紧急</option></NativeSelect></Field></div>
          <Field label="执行配置（可选覆盖）"><NativeSelect value={draft.runtimeProfileId} onChange={(event) => setDraft({ ...draft, runtimeProfileId: event.target.value })}><option value="">继承助手 / 团队默认配置</option>{runtimeProfiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</NativeSelect></Field>
          <Button variant="primary" type="submit" className="w-full py-2.5 text-xs">加入团队待办</Button>
        </form> : selectedWork && <div className="mt-5 space-y-4"><div><p className="text-[11px] font-semibold text-slate-400">目标</p><p className="mt-1 text-xs leading-5 text-slate-700">{selectedWork.goal}</p></div>{selectedWork.constraints && <div><p className="text-[11px] font-semibold text-slate-400">约束</p><p className="mt-1 text-xs leading-5 text-slate-700">{selectedWork.constraints}</p></div>}<div className="flex gap-2 border-t border-slate-100 pt-4 text-[11px] text-slate-500"><span className="rounded bg-slate-100 px-2 py-1">{selectedWork.priority}</span><span className="rounded bg-slate-100 px-2 py-1">创建于 {selectedWork.createdAt}</span></div><Field label="负责人"><NativeSelect aria-label="派发负责人" value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">选择助手</option>{team?.employees.map(employee => <option key={employee.id} value={employee.id} disabled={!!employee.currentWorkItem}>{employee.displayName}{employee.currentWorkItem ? '（已有工作）' : ''}</option>)}</NativeSelect></Field><Button variant="primary" type="button" disabled={!assigneeId} onClick={() => { dispatchWorkToEmployee(selectedWork.id, assigneeId); setSelectedWork(null); setAssigneeId(''); }} className="w-full py-2.5 text-xs">派发工作</Button><p className="text-[11px] leading-5 text-slate-400">也可关闭详情，将卡片拖到助手完成派发。</p><Button type="button" onClick={async () => { if (!window.confirm(`确定取消“${selectedWork.title}”吗？取消后不会回到待办队列。`)) return; await cancelWork(selectedWork.id); setSelectedWork(null); }} className="w-full rounded-lg border border-rose-200 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">取消工作</Button></div>}
      </div>}
      {auxiliaryDrawer?.visible&&<>
        <div className={`order-4 flex h-16 shrink-0 items-center border border-slate-200 bg-white pr-2 shadow-sm ${tab==='auxiliary'?'rounded-t-2xl border-b-transparent bg-violet-50/50':'rounded-2xl'}`}><button type="button" aria-expanded={tab==='auxiliary'} aria-controls="team-drawer-auxiliary" onClick={()=>{setTab('auxiliary');auxiliaryDrawer.onOpen();}} className="group flex h-full min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-slate-700 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-200"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tab==='auxiliary'?'bg-violet-100 text-violet-700':'bg-slate-100 text-slate-500'}`}><Settings2 className="h-4 w-4"/></span><span className="min-w-0 flex-1"><strong className="block text-xs">{auxiliaryDrawer.title}</strong><small className="mt-0.5 block text-[10px] font-normal text-slate-400">{auxiliaryDrawer.subtitle}</small></span><ChevronDown className={`h-4 w-4 transition-transform duration-300 ${tab==='auxiliary'&&auxiliaryDrawer.expanded?'rotate-180':''}`}/></button>{tab==='auxiliary'&&<Button variant="ghost" type="button" title={`关闭${auxiliaryDrawer.title}`} aria-label={`关闭${auxiliaryDrawer.title}抽屉`} onClick={()=>{setTab(null);auxiliaryDrawer.onClose();}} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"><X className="h-4 w-4"/></Button>}</div>
        <section id="team-drawer-auxiliary" aria-hidden={tab!=='auxiliary'} onTransitionEnd={(event)=>{if(event.propertyName==='grid-template-rows'&&!auxiliaryDrawer.expanded)auxiliaryDrawer.onCollapsed?.();}} className={`order-5 -mt-2 grid min-h-0 overflow-hidden rounded-b-2xl border border-t-0 border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition-[grid-template-rows,opacity] duration-300 ease-out ${tab==='auxiliary'&&auxiliaryDrawer.expanded?'grid-rows-[1fr] flex-1 opacity-100':'grid-rows-[0fr] opacity-0'}`}><div className="min-h-0 overflow-y-auto">{auxiliaryDrawer.content}</div></section>
      </>}
    </aside>
  );
}

function SidebarTeamChat({ team }: { team: WeWorkTeam }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const send = useWeWorkStore(state => state.sendTeamMessage);
  useEffect(() => { setDraft(''); setError(''); }, [team.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [team.teamMessages?.length]);
  const submit = async (message = draft) => {
    if (!message.trim() || sending) return false;
    const parsed = parseGroupDraft(draft, team.employees);
    if (!parsed.all && parsed.mentioned.length > 1) { setError('请一次 @ 一位助手；不带 @ 的消息全员可见。'); return false; }
    setSending(true); setError('');
    try { await send(team.id, message.trim(), parsed.recipientId, parsed.contextTagIds); setDraft(current => current === draft ? '' : current); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
    finally { setSending(false); }
  };
  return <div className="flex h-full min-h-0 flex-col">
    <div aria-label="团队群聊消息" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {!team.teamMessages?.length && <p className="text-center text-xs text-slate-400">发送第一条群聊消息，所有成员可见，@ 助手可邀请回复</p>}
      {team.teamMessages?.map(message => <TeamMessage compact key={message.id} team={team} message={message}/>)}
      <div ref={endRef} />
    </div>
    {error && <p role="alert" className="px-4 text-xs text-rose-600">{error}</p>}
    <TeamGroupComposer team={team} draft={draft} setDraft={setDraft} inputRef={inputRef} submit={submit} sending={sending} />
  </div>;
}
