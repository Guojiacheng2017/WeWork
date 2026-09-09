import type { WeWorkEmployee, WeWorkTeam } from './wework';
export function employeeWorkStatus(employee:WeWorkEmployee, deliveries:WeWorkTeam['collaborationDeliveries']=[]) {
  const activity=employee.executionActivity;
  const own=(deliveries??[]).filter(delivery=>delivery.employeeId===employee.id);
  const running=own.find(delivery=>delivery.status==='running');
  const queued=own.find(delivery=>delivery.status==='queued');
  const latest=own.at(-1);
  if(activity?.state==='working'||running) return {state:'working',label:'执行中',detail:activity?.state==='working'?activity.detail:'正在回复群聊消息'} as const;
  if(queued) return {state:'waiting',label:'等待中',detail:'群聊消息已排队，等待当前执行结束'} as const;
  if(latest && ['failed','uncertain'].includes(latest.status) && (!activity || latest.updatedAt>=activity.updatedAt)) return {state:'error',label:'需要处理',detail:latest.error??'群聊执行失败'} as const;
  if(activity && activity.state!=='idle') return {state:activity.state,label:activity.state==='error'?'需要处理':'等待中',detail:activity.detail};
  if(employee.status==='error')return {state:'error',label:'需要处理',detail:'执行异常，请打开工作台查看'} as const;
  if(employee.status==='blocked')return {state:'waiting',label:'等待中',detail:'任务受阻，等待协作或确认'} as const;
  if(employee.currentWorkItem) return {state:activity?.state==='idle'?'waiting':'working',label:activity?.state==='idle'?'等待中':'执行中',detail:employee.currentWorkItem.title} as const;
  if(employee.queuedWorkItems?.length)return {state:'waiting',label:'等待中',detail:`${employee.queuedWorkItems.length} 项工作待执行`} as const;
  return {state:'idle',label:'空闲',detail:'当前没有执行中的任务'} as const;
}

export function employeeErrorKey(employee: WeWorkEmployee, deliveries: WeWorkTeam['collaborationDeliveries'] = []) {
  const status = employeeWorkStatus(employee, deliveries);
  if (status.state !== 'error') return undefined;
  const latest = (deliveries ?? []).filter(d => d.employeeId === employee.id).at(-1);
  if (latest && ['failed', 'uncertain'].includes(latest.status) && (!employee.executionActivity || latest.updatedAt >= employee.executionActivity.updatedAt)) return `delivery:${latest.id}:${latest.updatedAt}`;
  return employee.executionActivity?.state === 'error' ? `activity:${employee.executionActivity.updatedAt}:${employee.executionActivity.detail}` : 'employee:error';
}
export function employeeRingState(employee: WeWorkEmployee, deliveries: WeWorkTeam['collaborationDeliveries'] = []) {
  const status = employeeWorkStatus(employee, deliveries);
  const key = employeeErrorKey(employee, deliveries);
  return key && key === employee.acknowledgedErrorKey ? 'idle' : status.state;
}
