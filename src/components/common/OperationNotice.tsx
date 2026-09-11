export function OperationNotice({message, onDismiss}: {message:string; onDismiss:()=>void}) {
  return <div role="alert" className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800"><span>{message}</span><button type="button" aria-label="关闭错误提示" onClick={onDismiss} className="shrink-0 underline">关闭</button></div>;
}
