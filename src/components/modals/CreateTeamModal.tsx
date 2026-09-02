import React, { useEffect, useMemo, useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { X } from 'lucide-react';
import { weworkHost, type HarnessId, type HarnessInstallation, type HarnessModel } from '../../runtime/weworkHost';
import { harnessNames } from '../../runtime/harnessPresentation';
import { createExecutionForCatalogModel } from '../team/workspaceDraft';

const runtimeFor = (harness: HarnessId): 'Pi' | 'Claude Code' | 'DSH' | 'Workspace' => harness === 'pi' ? 'Pi' : harness === 'claude-code' ? 'Claude Code' : harness === 'smalldashharness' ? 'DSH' : 'Workspace';

export const CreateTeamModal: React.FC = () => {
  const { isCreateTeamOpen, setCreateTeamOpen, createTeam } = useWeWorkStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadName, setLeadName] = useState('Employee-01 (Leader)');
  const [leadRole, setLeadRole] = useState('团队负责人 / 调度员');
  const [installations, setInstallations] = useState<HarnessInstallation[]>([]);
  const [models, setModels] = useState<HarnessModel[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<HarnessId, string>>>({});
  const [harness, setHarness] = useState<HarnessId>('smalldashharness');
  const [modelRef, setModelRef] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isCreateTeamOpen) return;
    void Promise.all([weworkHost.harnesses(), weworkHost.harnessPolicy(), weworkHost.harnessModels()]).then(([detected, policy, catalog]) => {
      const ready = detected.filter((item) => item.executionReady && policy.allowedHarnesses.includes(item.harness));
      const verified = catalog.models.filter((model) => model.verified && ready.some((item) => item.harness === model.harness));
      setInstallations(ready);
      setModels(verified);
      setDefaults(catalog.defaults);
      const first = ready.find((item) => verified.some((model) => model.harness === item.harness))?.harness;
      if (first) { setHarness(first); setLoadError(''); }
      else setLoadError('没有可用于首位助手的 Harness / 模型，请先到设置中完成设备检测与授权。');
    }).catch((error) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, [isCreateTeamOpen]);

  const harnessModels = useMemo(() => models.filter((model) => model.harness === harness), [harness, models]);
  useEffect(() => {
    const selected = harnessModels.find((model) => model.id === defaults[harness]) ?? harnessModels[0];
    setModelRef(selected?.id ?? '');
  }, [defaults, harness, harnessModels]);

  if (!isCreateTeamOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const model = harnessModels.find((item) => item.id === modelRef);
    if (!name.trim() || !model) return;
    createTeam(name, description, leadName, leadRole, runtimeFor(harness), createExecutionForCatalogModel(model, `team-lead-execution-${crypto.randomUUID()}`));
    setName('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
              🏛
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">新建助手协同团队</h3>
              <p className="text-[11px] text-slate-400">初始化独立工作空间与首位 Leader</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭新建团队"
            onClick={() => setCreateTeamOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label htmlFor="team-name" className="block font-bold text-slate-700 mb-1">团队名称 *</label>
            <input
              id="team-name"
              name="team-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：多模态图像算法组"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800"
            />
          </div>

          <div>
            <label htmlFor="team-description" className="block font-bold text-slate-700 mb-1">业务定位 / 目标简述</label>
            <input
              id="team-description"
              name="team-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：负责视觉模型迭代、样本标注与自动化质检"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-bold text-slate-400 mb-2">首位负责人 (Team Lead)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="lead-name" className="block text-[11px] font-medium text-slate-600 mb-1">助手姓名</label>
                <input
                  id="lead-name"
                  name="lead-name"
                  type="text"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label htmlFor="lead-role" className="block text-[11px] font-medium text-slate-600 mb-1">岗位角色</label>
                <input
                  id="lead-role"
                  name="lead-role"
                  type="text"
                  value={leadRole}
                  onChange={(e) => setLeadRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="team-lead-harness" className="block font-bold text-slate-700 mb-1">首位助手 Harness *</label>
            <select id="team-lead-harness" value={harness} onChange={(event) => setHarness(event.target.value as HarnessId)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value="" disabled>选择本机已允许的 Harness</option>
              {installations.filter((item) => models.some((model) => model.harness === item.harness)).map((item) => <option key={item.id} value={item.harness}>{harnessNames[item.harness]}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="team-lead-model" className="block font-bold text-slate-700 mb-1">首位助手模型 *</label>
            <select id="team-lead-model" value={modelRef} onChange={(event) => setModelRef(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              <option value="">选择该 Harness 的可用模型</option>
              {harnessModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}/{model.modelId}{model.id === defaults[harness] ? '（默认）' : ''}</option>)}
            </select>
            {loadError && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{loadError}</p>}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateTeamOpen(false)}
              className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !modelRef}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors cursor-pointer shadow-xs"
            >
              立即创建团队
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
