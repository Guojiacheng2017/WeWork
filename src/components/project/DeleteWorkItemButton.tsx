import { Trash2 } from 'lucide-react';
export function DeleteWorkItemButton({title,onClick}:{title:string;onClick:()=>void}) {
 return <button type="button" aria-label={`删除 ${title}`} title="删除工作项" onClick={onClick} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 outline-none hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-sky-400"><Trash2 className="h-3.5 w-3.5"/></button>;
}
