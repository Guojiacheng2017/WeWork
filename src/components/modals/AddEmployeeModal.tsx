import React, { useEffect, useMemo, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { ChevronDown, X, UserPlus } from 'lucide-react';
import { weworkHost, type HarnessId, type HarnessInstallation, type HarnessModel } from '../../runtime/weworkHost';
import { createExecutionForCatalogModel } from '../team/workspaceDraft';

const runtimeFor = (harness: HarnessId): 'Pi' | 'Claude Code' | 'DSH' | 'Workspace' => harness === 'pi' ? 'Pi' : harness === 'claude-code' ? 'Claude Code' : harness === 'smalldashharness' ? 'DSH' : 'Workspace';

export const AddEmployeeModal: React.FC = () => {
  const { isAddEmployeeOpen, setAddEmployeeOpen, addEmployee, selectedTeamId, teams } = useWeWorkStore();
  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  const defaultEmployeeNum = (currentTeam?.employees.length || 0) + 1;
  const [displayName, setDisplayName] = useState(`Employee-0${defaultEmployeeNum}`);
  const [roleName, setRoleName] = useState('CV 算法开发与调优');
  const [runtime, setRuntime] = useState<'Pi' | 'Claude Code' | 'DSH' | 'Workspace'>('Pi');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [installations, setInstallations] = useState<HarnessInstallation[]>([]);
  const [models, setModels] = useState<HarnessModel[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<HarnessId, string>>>({});
  const [harness, setHarness] = useState<HarnessId>('smalldashharness');
  const [modelRef, setModelRef] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAddEmployeeOpen) return;
    void Promise.all([weworkHost.harnesses(), weworkHost.harnessPolicy(), weworkHost.harnessModels()]).then(([detected, policy, catalog]) => {
      const ready = detected.filter((item) => item.executionReady && policy.allowedHarnesses.includes(item.harness));
      const verified = catalog.models.filter((item) => item.verified && ready.some((installation) => installation.harness === item.harness));
      setInstallations(ready); setModels(verified); setDefaults(catalog.defaults); setLoadError('');
      const firstHarness = ready.find((item) => verified.some((model) => model.harness === item.harness))?.harness;
      if (firstHarness) setHarness(firstHarness); else setLoadError('没有可分配给助手的 Harness 模型，请先在设置中完成允许与模型检查。');
    }).catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, [isAddEmployeeOpen]);

  const harnessModels = useMemo(() => models.filter((model) => model.harness === harness), [models, harness]);
  useEffect(() => { const selected = harnessModels.find((model) => model.id === defaults[harness]) ?? harnessModels[0]; setModelRef(selected?.id ?? ''); setRuntime(runtimeFor(harness)); }, [harness, harnessModels, defaults]);

  if (!isAddEmployeeOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const model = harnessModels.find((item) => item.id === modelRef);
    if (!displayName.trim() || !roleName.trim() || !model || saving) return;
    setSaving(true); setLoadError('');
    try { await addEmployee(selectedTeamId, displayName, roleName, runtime, createExecutionForCatalogModel(model)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">助手入职</h3>
              <p className="text-[11px] text-slate-400">为【{currentTeam?.name}】办理助手入职</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭助手入职"
            onClick={() => setAddEmployeeOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="employee-name" className="block font-bold text-slate-700 mb-1">助手姓名 / 代号 *</label>
            <input
              id="employee-name"
              name="employee-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：Employee-06 (压测专家)"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800"
            />
          </div>

          <label className="block font-bold text-slate-700">Harness *<select required aria-label="新助手 Harness" value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="" disabled>选择已允许的 Harness</option>{installations.filter((item) => models.some((model) => model.harness === item.harness)).map((item) => <option key={item.id} value={item.harness}>{item.harness === 'smalldashharness' ? 'smalldashharness（远程）' : item.harness}</option>)}</select></label>
          <label className="block font-bold text-slate-700">模型 *<select required aria-label="新助手模型" value={modelRef} onChange={(event) => setModelRef(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">选择该 Harness 的可用模型</option>{harnessModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}/{model.modelId}{model.id === defaults[harness] ? '（默认）' : ''}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-slate-400">来自本机 Harness 的已验证模型目录，并直接绑定到新助手 Session。</span></label>
          {loadError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{loadError}</p>}

          <div>
            <label htmlFor="employee-role" className="block font-bold text-slate-700 mb-1">专业岗位角色 (Role) *</label>
            <input
              id="employee-role"
              name="employee-role"
              type="text"
              required
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="例如：特征提取与异常分析员"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-slate-50"><span><span className="block">高级配置</span><span className="mt-0.5 block text-[10px] font-normal text-slate-400">运行环境</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>
            {advancedOpen && <div className="space-y-3 border-t border-slate-100 p-3"><div><label className="mb-2 block font-bold text-slate-700">运行环境 (Runtime) *</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">运行环境由所选 Harness 决定：<strong className="text-slate-700">{runtime}</strong>。设备设置负责允许范围；助手配置负责选择具体 Harness 与模型。</div>
            </div>
            </div>
            </div>}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddEmployeeOpen(false)}
              className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit" disabled={saving || !modelRef}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors cursor-pointer shadow-xs"
            >
              {saving ? '正在办理入职…' : '确认入职'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
