import React, { useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { Folder, FolderOpen, X } from 'lucide-react';
import { weworkHost } from '../../runtime/weworkHost';
import type { ResolvedWorkspace } from '../../domain/wework';
import { projectNameFromWorkspace, projectWorkspaceAssignment } from './projectSelection';

export const CreateTeamModal: React.FC = () => {
  const { isCreateTeamOpen, setCreateTeamOpen, createTeam } = useWeWorkStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loadError, setLoadError] = useState('');
  const [project, setProject] = useState<ResolvedWorkspace | null>(null);
  const [choosingProject, setChoosingProject] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isCreateTeamOpen) return null;

  const chooseProject = async () => {
    setChoosingProject(true); setLoadError('');
    try {
      const selected = await weworkHost.chooseLocalWorkspace();
      if (!selected) return;
      setProject(selected);
      if (!name.trim()) setName(projectNameFromWorkspace(selected));
    } catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setChoosingProject(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setLoadError('');
    try {
      await createTeam(name, description, project ? projectWorkspaceAssignment(project) : undefined);
      setName(''); setDescription(''); setProject(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
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
              <p className="text-[11px] text-slate-400">创建团队与工作空间</p>
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
            <label className="mb-1 block font-bold text-slate-700">项目</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500"><Folder className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-700">{project ? projectNameFromWorkspace(project) : '不关联项目'}</strong><span className="block truncate text-[10px] text-slate-400">{project?.rootPath ?? '可选；团队仍按相同流程创建'}</span></div>
              {project ? <button type="button" onClick={() => setProject(null)} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white">清除</button> : null}
              <button type="button" disabled={choosingProject} onClick={() => void chooseProject()} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-700 disabled:opacity-50"><FolderOpen className="h-3.5 w-3.5" />{choosingProject ? '选择中…' : 'Choose project'}</button>
            </div>
          </div>
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

          {loadError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{loadError}</p>}

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
              disabled={!name.trim() || saving}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors cursor-pointer shadow-xs"
            >
              {saving ? '创建中…' : '立即创建团队'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
