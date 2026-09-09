import { Button, Input, NativeSelect } from '../ui';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { HarnessId, HarnessModel } from '../../runtime/weworkHost';
import { harnessNames } from '../../runtime/harnessPresentation';

export type ModelDraft = { name: string; provider: string; modelId: string; baseUrl: string };

export function HarnessModelCatalog({ models, draft, setDraft, saving, save, chooseDefault, status }: {
  models: HarnessModel[];
  draft: ModelDraft; setDraft: Dispatch<SetStateAction<ModelDraft>>; saving: boolean; save: () => void; chooseDefault: (model: HarnessModel) => void; status?: string;
}) {
  const [adding, setAdding] = useState(false);
  const harnesses = [...new Set(models.map((model) => model.harness))];
  const [selectedHarness, setSelectedHarness] = useState<HarnessId>(() => harnesses.includes('pi') ? 'pi' : 'smalldashharness');
  const visibleModels = models.filter((model) => model.harness === selectedHarness);
  return <section className="rounded-xl border border-slate-200 p-4">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-800">Harness 模型</h4><p className="mt-1 text-[11px] leading-5 text-slate-400">选择 Harness 后查看其模型，并设置助手配置时的默认预选项。</p></div>{selectedHarness === 'smalldashharness' && <Button type="button" onClick={() => setAdding((value) => !value)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{adding ? '取消添加' : '添加模型'}</Button>}</div>
    <label className="mb-3 block text-xs font-semibold text-slate-600">Harness<NativeSelect aria-label="模型所属 Harness" value={selectedHarness} onChange={(event) => { setSelectedHarness(event.target.value as HarnessId); setAdding(false); }} className="mt-2 w-full px-3 py-2.5">{harnesses.map((id) => <option key={id} value={id}>{harnessNames[id]}</option>)}</NativeSelect></label>
    <div className="space-y-2">{visibleModels.map((model) => <div key={model.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate text-slate-700">{model.name}</strong><small className="text-slate-400">{model.provider} / {model.modelId}</small></span><span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${model.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{model.verified ? '连接已验证' : '尚未验证'}</span>{model.isDefault ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">WeWork 默认</span> : <Button type="button" onClick={() => chooseDefault(model)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">设为默认</Button>}</div>)}{!visibleModels.length && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">SDH 尚未报告可用模型。</p>}</div>
    {selectedHarness === 'smalldashharness' && adding && <div className="mt-4 border-t border-slate-100 pt-4"><p className="mb-3 text-[11px] leading-5 text-slate-400">添加额外的 OpenAI-compatible 模型端点。当前版本固定使用“无凭据”，不会读取或发送 API Key。</p><div className="grid grid-cols-2 gap-2">
      <Input aria-label="模型配置名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="显示名称" className="px-3 py-2" />
      <Input aria-label="可用模型 ID" value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} placeholder="Model ID" className="px-3 py-2" />
      <Input aria-label="可用模型提供方" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} placeholder="Provider" className="px-3 py-2" />
      <Input aria-label="可用模型 Base URL" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="OpenAI-compatible Base URL" className="px-3 py-2" />
    </div>
    <p className="mt-2 text-[11px] text-slate-500">鉴权方式：无凭据</p>
    <Button variant="primary" type="button" disabled={saving || !draft.name.trim() || !draft.modelId.trim() || !draft.baseUrl.trim()} onClick={save} className="mt-3 w-full py-2.5 text-xs">保存并检查连接</Button>
    {status && <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">{status}</p>}</div>}
  </section>;
}
