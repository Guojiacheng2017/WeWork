import { Button, NativeSelect } from '../ui';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { HarnessId, HarnessModel } from '../../runtime/weworkHost';
import { harnessNames } from '../../runtime/harnessPresentation';

export type ModelDraft = { name: string; provider: string; modelId: string; baseUrl: string };

export function HarnessModelCatalog({ models, chooseDefault }: {
  models: HarnessModel[];
  draft: ModelDraft; setDraft: Dispatch<SetStateAction<ModelDraft>>; saving: boolean; save: () => void; chooseDefault: (model: HarnessModel) => void; status?: string;
}) {
  const availableModels = models.filter(model => model.harness !== 'smalldashharness');
  const harnesses = [...new Set(availableModels.map((model) => model.harness))];
  const [selectedHarness, setSelectedHarness] = useState<HarnessId>(() => harnesses.includes('pi') ? 'pi' : harnesses[0] ?? 'pi');
  const visibleModels = availableModels.filter((model) => model.harness === selectedHarness);
  return <section className="rounded-xl border border-slate-200 p-4">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-800">Harness 模型</h4><p className="mt-1 text-[11px] leading-5 text-slate-400">选择 Harness 后查看其模型，并设置助手配置时的默认预选项。</p></div></div>
    <label className="mb-3 block text-xs font-semibold text-slate-600">Harness<NativeSelect aria-label="模型所属 Harness" value={selectedHarness} onChange={(event) => { setSelectedHarness(event.target.value as HarnessId); }} className="mt-2 w-full px-3 py-2.5">{harnesses.map((id) => <option key={id} value={id}>{harnessNames[id]}</option>)}</NativeSelect></label>
    <div className="space-y-2">{visibleModels.map((model) => <div key={model.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate text-slate-700">{model.name}</strong><small className="text-slate-400">{model.provider} / {model.modelId}</small></span><span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${model.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{model.verified ? '连接已验证' : '尚未验证'}</span>{model.isDefault ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">WeWork 默认</span> : <Button type="button" onClick={() => chooseDefault(model)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600">设为默认</Button>}</div>)}{!visibleModels.length && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">所选执行器尚未报告可用模型。</p>}</div>

  </section>;
}
