import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Copy, MoreHorizontal, Pencil, Save } from 'lucide-react';
import type { WorkflowTemplate } from '../../domain/wework';
import { workflowNavigation } from './graphHierarchy';

type WorkflowNavigationProps = { workflows: WorkflowTemplate[]; selectedId?: string; onSelect: (id: string) => void; onRename?: (workflow: WorkflowTemplate) => void; onSave?: (workflow: WorkflowTemplate) => void; onDuplicate?: (workflow: WorkflowTemplate) => void };

export function WorkflowNavigation({ workflows, selectedId, onSelect, onRename, onSave, onDuplicate }: WorkflowNavigationProps) {
  const parents = useMemo(() => workflowNavigation(workflows), [workflows]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close); window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [menu]);
  useEffect(() => {
    setCollapsed(previous => {
      const next = new Set(previous);
      let ancestor = selectedId ? parents.get(selectedId) : undefined;
      while (ancestor) { next.delete(ancestor); ancestor = parents.get(ancestor); }
      return next;
    });
  }, [selectedId, parents]);
  const renderBranch = (parentId?: string): React.ReactNode => <ul className={parentId ? 'ml-2 border-l border-slate-200 pl-1' : 'space-y-1'}>
    {workflows.filter(item => parents.get(item.id) === parentId).map(item => {
      const children = workflows.some(child => parents.get(child.id) === item.id);
      return <li key={item.id}>
        <div className="flex items-start gap-0.5">
          {children && <button type="button" aria-label={`${collapsed.has(item.id) ? '展开' : '收起'} ${item.name}`} aria-expanded={!collapsed.has(item.id)} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="mt-2 rounded p-0.5 text-slate-500 hover:bg-slate-100">{collapsed.has(item.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>}
          <button type="button" aria-current={item.id === selectedId ? 'page' : undefined} title={item.name} onClick={() => onSelect(item.id)} onContextMenu={event => { event.preventDefault(); setMenu({ id: item.id, x: event.clientX, y: event.clientY }); }} className={`min-w-0 flex-1 rounded-lg border px-2 py-2 pr-8 text-left ${item.id === selectedId ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
            <span className="block break-words text-[11px] font-semibold">{item.name}</span>
            <span className="mt-0.5 block text-[9px] text-slate-400">{item.workId ? '任务运行图' : item.temporary ? '临时编排' : '团队编排'} · {item.nodes.length} 节点</span>
          </button>
          <button type="button" aria-label={`${item.name} 更多操作`} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ id: item.id, x: rect.right + 6, y: rect.top }); }} className="-ml-8 mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"><MoreHorizontal /></button>
        </div>
        {menu?.id === item.id && createPortal(<div role="menu" aria-label={`${item.name} 操作`} style={{ position: 'fixed', left: Math.max(8, Math.min(menu.x, window.innerWidth - 164)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 126)) }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); } }} className="z-[1000] w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          <button autoFocus role="menuitem" type="button" onClick={() => { setMenu(null); onRename?.(item); }} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-slate-700 hover:bg-slate-100"><Pencil />重命名与说明</button>
          <button role="menuitem" type="button" onClick={() => { setMenu(null); onSave?.(item); }} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-slate-700 hover:bg-slate-100"><Save />保存编排</button>
          <button role="menuitem" type="button" onClick={() => { setMenu(null); onDuplicate?.(item); }} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-slate-700 hover:bg-slate-100"><Copy />保存副本</button>
        </div>, document.body)}
        {children && !collapsed.has(item.id) && renderBranch(item.id)}
      </li>;
    })}
  </ul>;
  return renderBranch();
}
