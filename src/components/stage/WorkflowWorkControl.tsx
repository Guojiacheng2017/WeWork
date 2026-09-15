import { useState } from 'react';
import { Button } from '../ui';
import { workflowBlockerMessage, type WorkflowExecutionState } from '../../domain/workflowExecution';

export function WorkflowWorkControl({ execution, onControl, onOpenWork }: {
  execution: WorkflowExecutionState;
  onControl: (continueWork: boolean) => Promise<void>;
  onOpenWork: (workId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completed = execution.status === 'completed';
  const paused = !execution.enabled && !completed;
  const control = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onControl(paused); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section aria-label="工作进度" className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-sm">
    <div className="flex items-center gap-3">
      <strong role="status">{completed ? '工作已完成' : paused ? '本项工作已暂停' : execution.status === 'blocked' ? '有任务需要处理' : '工作正在继续'}</strong>
      {!completed && <Button type="button" disabled={busy} onClick={() => void control()}>{busy ? '正在处理…' : paused ? '继续工作' : '暂停后续工作'}</Button>}
    </div>
    {!completed && <p className="mt-2 text-slate-600">{paused ? '继续后，团队会接着处理未完成的任务，已完成的任务不会重做。' : '暂停只停止安排下一项任务，正在执行的任务会继续完成。'}</p>}
    {execution.blockers.length > 0 && <ul className="mt-2 space-y-2">
      {execution.blockers.map((blocker, index) => <li key={`${blocker.workId ?? ''}:${index}`}>
        <span>{workflowBlockerMessage(blocker)}</span>
        {blocker.workId && <Button type="button" onClick={() => onOpenWork(blocker.workId!)}>查看任务</Button>}
      </li>)}
    </ul>}
    {error && <p role="alert" className="mt-2 text-rose-600">未能完成操作：{error}</p>}
  </section>;
}
