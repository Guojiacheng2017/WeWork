import { readPiJsonLines } from './pi-json-lines.js';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { scrubHostChildEnvironment } from './host/process.js';

// Only RPC commands with a headless response are exposed here. No shell parsing.
export async function executePiCommand(spec, command, options = {}) {
  const types = { compact: 'compact', status: 'get_session_stats' };
  if (!types[command]) throw new Error('此 Pi 原生命令尚未接入');
  if (spec.runtimeProfile.adapter !== 'pi') throw new Error('当前助手未使用 Pi');
  if (spec.workspace?.kind !== 'local' || !(await stat(spec.workspace.rootPath)).isDirectory()) throw new Error('Pi 命令需要有效的本地助手工作目录');
  const args = ['--mode','rpc','--session-id',spec.session.id];
  const model = spec.runtimeProfile.model;
  if (model?.modelId && model.modelId !== 'default') args.push('--model', `${model.provider && model.provider !== 'pi' ? model.provider + '/' : ''}${model.modelId}`);
  const child = (options.spawnProcess ?? spawn)(options.executablePath ?? 'pi', args, {cwd:spec.workspace.rootPath,env:scrubHostChildEnvironment(process.env),shell:false,stdio:['pipe','pipe','pipe']});
  let stderr = '';
  let closeLines;
  try {
    return await new Promise((resolve,reject) => {
      const timer = setTimeout(()=>reject(new Error('Pi 原生命令执行超时，请检查执行器状态')), options.timeoutMs ?? 120000);
      const done = (error, data) => { clearTimeout(timer); error ? reject(error) : resolve(data); };
      child.on('error',error=>done(error)); child.stdin.on('error',error=>done(error));
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2000)});
      child.on('close',()=>done(new Error(stderr || 'Pi 命令进程已关闭')));
      closeLines = readPiJsonLines(child.stdout, event => { if(event.type==='response' && event.id==='wework-native-command') done(event.success ? null : new Error(event.error || 'Pi 命令失败'),event.data); }, done);
      child.stdin.write(JSON.stringify({id:'wework-native-command',type:types[command]})+'\n');
    });
  } finally {
    closeLines?.();
    child.stdin.end();
    if (child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000); timer.unref?.();
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }
}
