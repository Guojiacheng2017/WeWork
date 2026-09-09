import { Dialog, DialogFooter, Field, Button, Input } from '../ui';
import React, { useState } from 'react';
import { useWeWorkStore } from '../../state/weworkStore';
import { Folder, FolderOpen, Users } from 'lucide-react';
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
    if (!name.trim() || saving) return;
    setSaving(true); setLoadError('');
    try {
      await createTeam(name.trim(), description.trim(), project ? projectWorkspaceAssignment(project) : undefined);
      setName(''); setDescription(''); setProject(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isCreateTeamOpen} onClose={() => setCreateTeamOpen(false)} busy={saving} title="新建助手协同团队" description="创建团队与工作空间" icon={<span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><Users size={16} aria-hidden="true" /></span>}>
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="mb-1 block font-bold text-slate-700">项目</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-500"><Folder className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-700">{project ? projectNameFromWorkspace(project) : '不关联项目'}</strong><span className="block truncate text-[11px] text-slate-400">{project?.rootPath ?? '可选；团队仍按相同流程创建'}</span></div>
              {project ? <Button type="button" onClick={() => setProject(null)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-white">清除</Button> : null}
              <Button variant="secondary" type="button" disabled={choosingProject} onClick={() => void chooseProject()} className="flex shrink-0 items-center gap-1 px-2.5 py-2 text-[11px]"><FolderOpen className="h-3.5 w-3.5" />{choosingProject ? '选择中…' : '选择项目'}</Button>
            </div>
          </div>
          <Field label="团队名称">
            <Input
              id="team-name"
              name="team-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：多模态图像算法组"
              className="w-full px-3 py-2"
            />
          </Field>

          <Field label="业务定位 / 目标简述">
            <Input
              id="team-description"
              name="team-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：负责视觉模型迭代、样本标注与自动化质检"
              className="w-full px-3 py-2"
            />
          </Field>

          {loadError && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{loadError}</p>}

          {/* Footer Buttons */}
          <DialogFooter>
            <Button variant="ghost"
              type="button"
              disabled={saving} onClick={() => setCreateTeamOpen(false)}
              className="px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              取消
            </Button>
            <Button variant="primary"
              type="submit" loading={saving}
              disabled={!name.trim() || saving}
              className="px-4 py-1.5 transition-colors cursor-pointer"
            >
              {saving ? '创建中…' : '立即创建团队'}
            </Button>
          </DialogFooter>
        </form>
    </Dialog>
  );
};
