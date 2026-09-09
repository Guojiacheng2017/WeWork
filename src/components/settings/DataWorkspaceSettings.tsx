import { FolderTree, ShieldCheck } from 'lucide-react';
import type { WeWorkDataInfo } from '../../runtime/weworkHost';

export function DataWorkspaceSettings({ dataInfo }: { dataInfo: WeWorkDataInfo | null }) {
  const root = dataInfo?.rootPath ?? '~/Documents/WeWork';
  const config = dataInfo?.configPath ?? '~/Documents/.wework';
  return <div className="space-y-7 p-7">
    <div><h3 className="text-lg font-bold text-slate-900">数据、工作区与安全</h3><p className="mt-1 text-xs text-slate-400">设备设置只定义 WeWork 的两个根目录；团队和助手始终位于所属团队层级内。</p></div>
    <section className="rounded-xl border border-slate-200 p-5">
      <div className="flex items-start gap-3"><FolderTree className="mt-0.5 h-5 w-5 text-sky-600" /><div className="min-w-0 flex-1"><strong className="text-sm text-slate-800">WeWork Workspace</strong><p className="mt-1 break-all text-xs font-semibold text-slate-600">{root}</p></div></div>
      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 font-mono text-[11px] leading-6 text-slate-600"><div>{root}/&lt;team-id&gt;/</div><div className="pl-5">team/</div><div className="pl-5">employees/&lt;employee-id&gt;/</div></div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">团队设置可以显式指定另一个绝对目录；不存在设备级“当前目录”，更不会使用文件系统根目录。</p>
    </section>
    <section className="rounded-xl border border-slate-200 p-5"><strong className="text-sm text-slate-800">WeWork 用户配置</strong><p className="mt-2 break-all text-xs font-semibold text-slate-600">{config}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">保存设备偏好、Harness 策略和本地 Skill Pool 元数据；它与 Workspace 并列，不属于任何团队。</p></section>
    <section className="rounded-xl border border-slate-200 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /><div><strong className="text-sm text-slate-800">凭据保存在系统安全存储</strong><p className="mt-1 text-xs leading-5 text-slate-400">模型密钥和 SSH secret 不进入团队状态、用户配置或助手 Workspace；其中只保存 credentialRef。</p></div></div></section>
  </div>;
}
