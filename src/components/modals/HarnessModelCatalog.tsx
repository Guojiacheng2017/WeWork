import type { Dispatch, SetStateAction } from 'react';
import type { HarnessId, HarnessInstallation, HarnessModel } from '../../runtime/weworkHost';
import { harnessNames } from '../../runtime/harnessPresentation';

export type ModelDraft = { name: string; provider: string; modelId: string; baseUrl: string };

export function HarnessModelCatalog({ harness, setHarness, installations, models, draft, setDraft, saving, save, chooseDefault }: {
  harness: HarnessId; setHarness: (value: HarnessId) => void; installations: HarnessInstallation[]; models: HarnessModel[];
  draft: ModelDraft; setDraft: Dispatch<SetStateAction<ModelDraft>>; saving: boolean; save: () => void; chooseDefault: (model: HarnessModel) => void;
}) {
  const visibleModels = models.filter((model) => model.harness === harness);
  return <section className="rounded-xl border border-slate-200 p-4">
    <div className="mb-3"><h4 className="text-sm font-bold text-slate-800">smalldashharness 可用模型</h4><p className="mt-1 text-[11px] leading-5 text-slate-400">配置 OpenAI-compatible 模型端点。当前版本固定使用“无凭据”，不会读取或发送 API Key。</p></div>
    <label className="block text-xs font-semibold text-slate-600">Harness<select value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs">{installations.map((item) => <option key={item.id} value={item.harness}>{harnessNames[item.harness]}</option>)}</select></label>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <input aria-label="模型配置名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="显示名称" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      <input aria-label="可用模型 ID" value={draft.modelId} onChange={(event) => setDraft({ ...draft, modelId: event.target.value })} placeholder="Model ID" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      <input aria-label="可用模型提供方" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} placeholder="Provider" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      <input aria-label="可用模型 Base URL" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="OpenAI-compatible Base URL" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
    </div>
    <p className="mt-2 text-[10px] text-slate-500">鉴权方式：无凭据</p>
    <button type="button" disabled={saving || !draft.name.trim() || !draft.modelId.trim() || !draft.baseUrl.trim()} onClick={save} className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white disabled:opacity-40">保存并检查连接</button>
    <div className="mt-4 space-y-2">{visibleModels.map((model) => <div key={model.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"><span className="min-w-0 flex-1"><strong className="block truncate text-slate-700">{model.name}</strong><small className="text-slate-400">{model.provider} / {model.modelId}</small></span><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${model.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{model.verified ? '连接已验证' : '尚未验证'}</span>{model.isDefault ? <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">WeWork 默认</span> : <button type="button" onClick={() => chooseDefault(model)} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">设为默认</button>}</div>)}{!visibleModels.length && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">SDH 尚未配置可用模型。</p>}</div>
  </section>;
}
