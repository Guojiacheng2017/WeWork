import { Input, NativeSelect, Textarea } from '../ui';
import { useState } from 'react';
import type { WorkItem } from '../../domain/wework';
import { localWeWorkApi } from '../../api/weworkApi';
import { useWeWorkStore } from '../../state/weworkStore';
import type { WorkDocument } from '../../local/workContext';

export function WorkContextPanel({ work }: { work: WorkItem }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<WorkDocument['kind']>('input');
  const [summary, setSummary] = useState('');
  const [evidence, setEvidence] = useState('');
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrate = useWeWorkStore((state) => state.hydrate);
  const records = work.records;
  const delivery = records?.deliverables.at(-1);
  const reviewed = records?.reviews.some((review) => review.deliverableId === delivery?.id);
  const action = async (run: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await run(); await hydrate(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <section className="border-t border-slate-200 p-4 text-xs space-y-3" aria-label="任务上下文与交付">
    <h4 className="font-semibold text-slate-800">任务上下文与交付</h4>
    <p className="text-slate-500">{work.workflowNodeId ? '输入与决策供助手读取；有效提交后可推进下游，交付物仍需独立验收。' : '输入与决策供助手读取；输出需提交、验收后才能完成任务。'}</p>
    {work.acceptanceCriteria && <p>验收标准：{work.acceptanceCriteria}</p>}
    <details>
      <summary className="cursor-pointer">资料与产物 · {records?.documents.length ?? 0} 个版本</summary>
      <div className="space-y-2 mt-2 max-h-56 overflow-auto">
        {records?.documents.map((document) => <details key={document.id} className="rounded border border-slate-200 p-2">
          <summary className="cursor-pointer">{document.title} · {document.kind} · v{document.revision}</summary>
          <pre className="whitespace-pre-wrap break-words mt-2 font-sans">{document.content}</pre>
        </details>)}
      </div>
    </details>
    <details>
      <summary className="cursor-pointer">添加输入、决策或输出文档</summary>
      <form className="space-y-2 mt-2" onSubmit={(event) => { event.preventDefault(); void action(async () => { await localWeWorkApi.saveWorkDocument(work.id, { title, content, kind }); setTitle(''); setContent(''); }); }}>
        <NativeSelect aria-label="文档类型" className="rounded p-1 w-full" value={kind} onChange={(event) => setKind(event.target.value as WorkDocument['kind'])}>
          <option value="input">输入资料</option><option value="decision">已确认决策</option><option value="output">输出产物</option>
        </NativeSelect>
        <Input aria-label="文档标题" placeholder="文档标题" required maxLength={300} className="rounded p-2 w-full" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Textarea aria-label="文档正文" placeholder="正文或带版本的产物引用" required maxLength={100000} className="rounded p-2 w-full" rows={4} value={content} onChange={(event) => setContent(event.target.value)} />
        <button disabled={busy} className="border rounded px-3 py-1 disabled:opacity-50">保存文档</button>
      </form>
    </details>
    <details>
      <summary className="cursor-pointer">进度记录 · {records?.progress.length ?? 0}</summary>
      {records?.progress.slice(-10).map((record) => <div key={record.id} className="border-l-2 border-slate-200 pl-2 my-2">
        <p>{record.summary}</p>{record.blockers && <p className="text-amber-700">阻塞：{record.blockers}</p>}{record.nextStep && <p className="text-slate-500">下一步：{record.nextStep}</p>}
      </div>)}
    </details>
    <details>
      <summary className="cursor-pointer">审计记录 · {records?.audit.length ?? 0}</summary>
      {records?.audit.slice(-10).map((entry) => <p key={entry.id} className="my-1 text-slate-500 break-all">{entry.type} · {entry.actor ? `助手 ${entry.actor.employeeId} / ${entry.actor.runId}` : '用户操作'} · {entry.createdAt}</p>)}
    </details>
    <details>
      <summary className="cursor-pointer">手动提交交付</summary>
      <form className="space-y-2 mt-2" onSubmit={(event) => { event.preventDefault(); void action(() => localWeWorkApi.submitDeliverable(work.id, { summary, evidence, documentIds: selectedOutputs })); }}>
        {records?.documents.filter((d) => d.kind === 'output').map((document) => <label key={document.id} className="flex gap-2 items-center">
          <input type="checkbox" checked={selectedOutputs.includes(document.id)} onChange={(event) => setSelectedOutputs((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} />{document.title} · v{document.revision}
        </label>)}
        <Input aria-label="交付说明" placeholder="交付说明" required maxLength={4000} className="rounded p-2 w-full" value={summary} onChange={(event) => setSummary(event.target.value)} />
        <Textarea aria-label="验证证据" placeholder="验证证据或检查结果" required maxLength={4000} className="rounded p-2 w-full" value={evidence} onChange={(event) => setEvidence(event.target.value)} />
        <button disabled={busy || !selectedOutputs.length} className="border rounded px-3 py-1 disabled:opacity-50">提交待验收</button>
      </form>
    </details>
    {delivery ? <div className="rounded bg-slate-50 p-3 space-y-2">
      <p className="font-semibold">最新交付 · {work.deliveryStatus === 'accepted' ? '已验收' : work.deliveryStatus === 'changes_requested' ? '需修改' : '待验收'}</p>
      <p>{delivery.summary}</p><p>验证证据：{delivery.evidence}</p>
      {delivery.knownIssues && <p>已知问题：{delivery.knownIssues}</p>}
      <p>产物：{delivery.documentIds.map((id) => records?.documents.find((d) => d.id === id)?.title ?? id).join('、')}</p>
      {!reviewed && <>
        <Textarea aria-label="验收意见" placeholder="填写验收或修改意见" className="rounded p-2 w-full" maxLength={4000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        <div className="flex gap-2">
          <button disabled={busy || !feedback.trim()} className="border rounded px-3 py-1 disabled:opacity-50" onClick={() => void action(() => localWeWorkApi.reviewDeliverable(work.id, { deliverableId: delivery.id, decision: 'accepted', feedback }))}>验收通过</button>
          <button disabled={busy || !feedback.trim()} className="border rounded px-3 py-1 disabled:opacity-50" onClick={() => void action(() => localWeWorkApi.reviewDeliverable(work.id, { deliverableId: delivery.id, decision: 'changes_requested', feedback }))}>要求修改</button>
        </div>
      </>}
    </div> : <p className="text-slate-500">尚无交付。助手需通过平台工具保存输出并提交验证证据。</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
  </section>;
}
