import { randomEmployeeName } from '../../domain/employeeNames';
import { Dialog, DialogFooter, Field, Button, Input, NativeSelect } from '../ui';
import React, { useEffect, useMemo, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { ChevronDown, UserPlus } from 'lucide-react';
import { weworkHost, type HarnessId, type HarnessInstallation, type HarnessModel } from '../../runtime/weworkHost';
import { createDefaultSdhExecution, createExecutionForCatalogModel } from '../team/workspaceDraft';
import { canSubmitEmployeeOnboarding, initialHarnessForOnboarding, initialModelRefForOnboarding } from './employeeOnboarding';

const runtimeFor = (harness: HarnessId): 'Pi' | 'Claude Code' | 'DSH' | 'Workspace' => harness === 'pi' ? 'Pi' : harness === 'claude-code' ? 'Claude Code' : harness === 'smalldashharness' ? 'DSH' : 'Workspace';

export const AddEmployeeModal: React.FC<{ configureAfterCreation?: boolean }> = ({ configureAfterCreation = false }) => {
  const { isAddEmployeeOpen, setAddEmployeeOpen, addEmployee, selectedTeamId, teams } = useWeWorkStore();
  const currentTeam = teams.find((t) => t.id === selectedTeamId);

  const [displayName, setDisplayName] = useState(() => randomEmployeeName(currentTeam?.employees.map(employee => employee.displayName)));
  const [roleName, setRoleName] = useState('CV 算法开发与调优');
  const [runtime, setRuntime] = useState<'Pi' | 'Claude Code' | 'DSH' | 'Workspace'>('Pi');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [installations, setInstallations] = useState<HarnessInstallation[]>([]);
  const [models, setModels] = useState<HarnessModel[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<HarnessId, string>>>({});
  const [harness, setHarness] = useState<HarnessId>('pi');
  const [modelRef, setModelRef] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAddEmployeeOpen) return;
    if (configureAfterCreation) { setDisplayName(randomEmployeeName(currentTeam?.employees.map(employee => employee.displayName))); setRoleName(''); setLoadError(''); return; }
    let cancelled = false;
    setLoading(true); setModels([]); setInstallations([]); setModelRef(''); setLoadError('');
    setDisplayName(randomEmployeeName(currentTeam?.employees.map(employee => employee.displayName)));
    void Promise.all([weworkHost.harnesses(), weworkHost.harnessPolicy(), weworkHost.harnessModels()]).then(([detected, policy, catalog]) => {
      if (cancelled) return;
      const ready = detected.filter((item) => item.executionReady && policy.allowedHarnesses.includes(item.harness));
      const verified = catalog.models.filter((item) => item.verified && ready.some((installation) => installation.harness === item.harness));
      setInstallations(ready); setModels(verified); setDefaults(catalog.defaults); setLoadError('');
      const firstHarness = initialHarnessForOnboarding(ready, verified);
      if (firstHarness) setHarness(firstHarness); else setLoadError(window.weworkHost ? '没有可用模型，请在设置中允许执行器并完成模型检查。' : '浏览器模式无法探测本机执行器。请在桌面版配置执行器与模型后办理入职。');
    }).catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAddEmployeeOpen, selectedTeamId, configureAfterCreation]);

  const harnessModels = useMemo(() => models.filter((model) => model.harness === harness), [models, harness]);
  const harnessReady = installations.some((installation) => installation.harness === harness);
  const canSubmit = canSubmitEmployeeOnboarding({ saving, loading, displayName, roleName, harness, modelRef, harnessReady });
  useEffect(() => { setModelRef(initialModelRefForOnboarding(harness, harnessModels, defaults)); setRuntime(runtimeFor(harness)); }, [harness, harnessModels, defaults]);

  if (!isAddEmployeeOpen) return null;

  if (configureAfterCreation) return <Dialog open onClose={() => setAddEmployeeOpen(false)} busy={saving} title="新建助手" description="先创建助手，再在设置页面选择执行器、模型与技能。">
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (saving || !displayName.trim() || !currentTeam) return;
      setSaving(true); setLoadError('');
      try {
        await addEmployee(currentTeam.id, displayName.trim(), roleName.trim(), 'Workspace');
        const state = useWeWorkStore.getState();
        if (state.selectedEmployeeId) state.openWorkbench(state.selectedEmployeeId, 'settings');
      } catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
      finally { setSaving(false); }
    }}>
      <Field label="助手名称"><Input autoFocus required value={displayName} onChange={event => setDisplayName(event.target.value)} /></Field>
      <Field label="职责（可稍后补充）"><Input value={roleName} onChange={event => setRoleName(event.target.value)} /></Field>
      {loadError && <p role="alert" className="text-sm text-rose-600">{loadError}</p>}
      <DialogFooter><Button type="button" variant="secondary" onClick={() => setAddEmployeeOpen(false)}>取消</Button><Button type="submit" disabled={saving || !displayName.trim()}>{saving ? '正在创建…' : '创建并配置'}</Button></DialogFooter>
    </form>
  </Dialog>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const model = harnessModels.find((item) => item.id === modelRef);
    if (!canSubmit || (harness !== 'smalldashharness' && !model)) return;
    setSaving(true); setLoadError('');
    try { await addEmployee(selectedTeamId, displayName, roleName, runtime, model ? createExecutionForCatalogModel(model) : createDefaultSdhExecution()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isAddEmployeeOpen} onClose={() => setAddEmployeeOpen(false)} busy={saving} title="助手入职" description={`为【${currentTeam?.name}】办理助手入职`} icon={<span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><UserPlus size={16} aria-hidden="true" /></span>}>
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <Field label="助手姓名 / 代号">
            <Input
              id="employee-name"
              name="employee-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：林知远"
              className="w-full px-3 py-2"
            />
          </Field>

          <label className="block font-bold text-slate-700">Harness *<NativeSelect required aria-label="新助手 Harness" value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="mt-1.5 w-full px-3 py-2.5"><option value="" disabled>选择已允许的 Harness</option>{installations.filter((item) => item.harness === 'smalldashharness' || models.some((model) => model.harness === item.harness)).map((item) => <option key={item.id} value={item.harness}>{item.harness === 'smalldashharness' ? 'smalldashharness（远程）' : item.harness}</option>)}</NativeSelect></label>
          <label className="block font-bold text-slate-700">模型 {harness === 'smalldashharness' ? '' : '*'}<NativeSelect required={harness !== 'smalldashharness'} aria-label="新助手模型" value={modelRef} onChange={(event) => setModelRef(event.target.value)} className="mt-1.5 w-full px-3 py-2.5"><option value="">{harness === 'smalldashharness' ? '跟随 SDH 默认模型' : '选择该 Harness 的可用模型'}</option>{harnessModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}/{model.modelId}{model.id === defaults[harness] ? '（默认）' : ''}</option>)}</NativeSelect><span className="mt-1 block text-[11px] font-normal text-slate-400">{harness === 'smalldashharness' ? '默认由 SDH 管理模型；也可以选择 SDH 提供的模型目录项。' : '来自本机 Harness 的已验证模型目录，并直接绑定到新助手 Session。'}</span></label>
          {loading && <p role="status">正在检查可用执行器与模型…</p>}
          {loadError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{loadError}</p>}

          <Field label="专业岗位角色 (Role)">
            <Input
              id="employee-role"
              name="employee-role"
              type="text"
              required
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="例如：特征提取与异常分析员"
              className="w-full px-3 py-2"
            />
          </Field>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-slate-50"><span><span className="block">高级配置</span><span className="mt-0.5 block text-[11px] font-normal text-slate-400">运行环境</span></span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>
            {advancedOpen && <div className="space-y-3 border-t border-slate-100 p-3"><div><label className="mb-2 block font-bold text-slate-700">运行环境 (Runtime) *</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">运行环境由所选 Harness 决定：<strong className="text-slate-700">{runtime}</strong>。设备设置负责允许范围；助手配置负责选择具体 Harness 与模型。</div>
            </div>
            </div>
            </div>}
          </div>

          {/* Footer Buttons */}
          <DialogFooter>
            <Button variant="ghost"
              type="button"
              disabled={saving} onClick={() => setAddEmployeeOpen(false)}
              className="px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              取消
            </Button>
            <Button variant="primary"
              type="submit" loading={saving} disabled={!canSubmit}
              className="px-4 py-1.5 transition-colors cursor-pointer"
            >
              {saving ? '正在办理入职…' : '确认入职'}
            </Button>
          </DialogFooter>
        </form>
    </Dialog>
  );
};
