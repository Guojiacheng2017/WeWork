import { Button } from '../ui';
import { useRef, useState } from 'react';
import { normalizeCollaborationDatabase, type CollaborationDatabase } from '../../domain/collaboration';
import { localWeWorkApi } from '../../api/weworkApi';
import { useWeWorkStore } from '../../state/weworkStore';

export function ProjectTransfer({teamId, database}:{teamId:string;database:CollaborationDatabase}) {
  const file = useRef<HTMLInputElement>(null);
  const [preview,setPreview]=useState<CollaborationDatabase>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const download=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(database,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`${teamId}-projects.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="mb-3 text-xs">
    <div className="flex gap-2"><Button variant="secondary" type="button" onClick={download} className="px-3 py-2">导出 JSON</Button><Button variant="secondary" type="button" disabled={busy} onClick={()=>file.current?.click()} className="px-3 py-2">导入项目</Button></div>
    <input ref={file} type="file" accept=".json,application/json" aria-label="导入项目文件" className="hidden" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';setError('');setPreview(undefined);if(!selected)return;try{if(selected.size>10*1024*1024)throw new Error('文件不能超过 10 MB');const parsed=normalizeCollaborationDatabase(JSON.parse(await selected.text()));if(!parsed)throw new Error('文件没有项目数据');setPreview(parsed)}catch{setError('无法导入：请选择有效的 WeWork 项目 JSON 文件（最大 10 MB）。')}}}/>
    {preview&&<div role="region" aria-label="项目导入预览" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><strong>导入预览</strong><p className="my-2">{preview.projects.length} 个项目 · {preview.workItems.length} 个工作项 · {preview.comments.length} 条评论。将替换当前 {database.workItems.length} 个工作项；建议先导出备份。</p><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await localWeWorkApi.replaceCollaborationDatabase(teamId,preview);await useWeWorkStore.getState().hydrate();setPreview(undefined)}catch(e){setError(e instanceof Error?e.message:'导入失败')}finally{setBusy(false)}}} className="mr-3 rounded bg-slate-900 px-3 py-2 text-white">{busy?'导入中…':'确认替换项目数据'}</button><button disabled={busy} onClick={()=>setPreview(undefined)}>取消</button></div>}
    {error&&<p role="alert" className="mt-2 text-rose-600">{error}</p>}
  </div>;
}
