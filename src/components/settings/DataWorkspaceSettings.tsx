import { useMemo, useState } from 'react';
import { ArchiveRestore, Download, FolderTree, ShieldCheck } from 'lucide-react';
import { weworkHost, type WeWorkDataInfo } from '../../runtime/weworkHost';
import { useWeWorkStore } from '../../state/weworkStore';

export function DataWorkspaceSettings({ dataInfo }: { dataInfo: WeWorkDataInfo | null }) {
  const root = dataInfo?.rootPath ?? '~/Documents/WeWork';
  const config = dataInfo?.configPath ?? '~/Documents/.wework';
  const hydrate = useWeWorkStore(state => state.hydrate);
  const activeTeams = useWeWorkStore(state => state.teams);
  const archivedTeams = useWeWorkStore(state => state.archivedTeams);
  const teams = useMemo(() => [...activeTeams, ...archivedTeams], [activeTeams, archivedTeams]);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [exportTeamId, setExportTeamId] = useState('');
  const [message, setMessage] = useState('');
  const transfer = async (kind: 'export' | 'import') => {
    if (kind === 'import' && !window.confirm('导入会合并 ZIP 中的团队；同 ID 团队不会被覆盖。继续选择文件？')) return;
    setBusy(kind); setMessage('');
    try {
      const result = kind === 'export' ? await weworkHost.exportWorkspace(exportTeamId || undefined) : await weworkHost.importWorkspace();
      if (!result) return;
      if (kind === 'import') await hydrate();
      const rebind = result.rebindCount ? `；${result.rebindCount} 项设备路径或凭据需要重新绑定` : '';
      setMessage(kind === 'export' ? `已导出 ${result.teamCount} 个团队${rebind}` : `已导入 ${result.teamCount} 个团队${rebind}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  return <div className="space-y-7 p-7">
    <div><h3 className="text-lg font-bold text-slate-900">数据、工作区与安全</h3><p className="mt-1 text-xs text-slate-400">设备设置只定义 WeWork 的两个根目录；团队和助手始终位于所属团队层级内。</p></div>
    <section className="rounded-xl border border-slate-200 p-5">
      <div className="flex items-start gap-3"><FolderTree className="mt-0.5 h-5 w-5 text-sky-600" /><div className="min-w-0 flex-1"><strong className="text-sm text-slate-800">WeWork Workspace</strong><p className="mt-1 break-all text-xs font-semibold text-slate-600">{root}</p></div></div>
      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 font-mono text-[11px] leading-6 text-slate-600"><div>{root}/&lt;team-id&gt;/</div><div className="pl-5">team/</div><div className="pl-5">employees/&lt;employee-id&gt;/</div></div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">团队设置可以显式指定另一个绝对目录；不存在设备级“当前目录”，更不会使用文件系统根目录。</p>
    </section>
    <section className="rounded-xl border border-slate-200 p-5"><strong className="text-sm text-slate-800">WeWork 用户配置</strong><p className="mt-2 break-all text-xs font-semibold text-slate-600">{config}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">保存设备偏好、Harness 策略和本地 Skill Pool 元数据；它与 Workspace 并列，不属于任何团队。</p></section>
    <section className="rounded-xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-5"><div><strong className="text-sm text-slate-800">跨设备迁移</strong><p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">导出单个 ZIP，可选择全部团队或一个团队，包含对应状态、会话、任务及 WeWork 内的工作文件。导入时自动重建索引和本机路径；系统凭据与外部目录不会进入 ZIP。</p></div><div className="flex shrink-0 gap-2"><select aria-label="导出范围" value={exportTeamId} disabled={busy !== null} onChange={event => setExportTeamId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><option value="">全部团队</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}{team.archivedAt ? '（已归档）' : ''}</option>)}</select><button type="button" disabled={busy !== null || !teams.length} onClick={() => void transfer('export')} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4"/>{busy === 'export' ? '导出中…' : '导出 ZIP'}</button><button type="button" disabled={busy !== null} onClick={() => void transfer('import')} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><ArchiveRestore className="h-4 w-4"/>{busy === 'import' ? '导入中…' : '导入 ZIP'}</button></div></div>{message && <p role="status" className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{message}</p>}</section>
    <section className="rounded-xl border border-slate-200 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /><div><strong className="text-sm text-slate-800">凭据保存在系统安全存储</strong><p className="mt-1 text-xs leading-5 text-slate-400">模型密钥和 SSH secret 不进入团队状态、用户配置或助手 Workspace；其中只保存 credentialRef。</p></div></div></section>
  </div>;
}
