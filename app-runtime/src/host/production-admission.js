export async function checkProductionAdmission(wework, spec, toolName) {
  if (!spec.wework?.chat || ['read', 'ls', 'find', 'grep'].includes(toolName) || toolName.startsWith('wework_')) return;
  const state = await wework.api.snapshot();
  const team = state.teams.find(team => team.id === spec.wework.teamId);
  const graphs = [...(team?.workflows ?? []), ...(team?.workflow ? [team.workflow] : [])];
  if (graphs.some(graph => graph.nodes.some(node => node.workItemId && !['completed','cancelled'].includes(node.status)) &&
    graph.nodes.some(node => node.assignedEmployeeId === spec.employeeId))) {
    throw new Error('当前有未完成的 DAG：群聊/私聊仅用于协调和读取。请通过对应 DAG 工作任务执行制作，不能从聊天启动 shell、写文件或其他生产工具。');
  }
}
