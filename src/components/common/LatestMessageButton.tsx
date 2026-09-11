export function LatestMessageButton({onClick}: {onClick:()=>void}) {
  return <div className="relative z-10 h-0 shrink-0"><button type="button" onClick={onClick} className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-50 rounded-full border border-slate-200 px-3 py-1 text-xs text-sky-700 shadow-sm">回到最新消息 ↓</button></div>;
}
