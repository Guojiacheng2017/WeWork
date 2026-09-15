import type { WorkflowTemplate } from '../../domain/wework';

export function parentWorkflows(workflows: WorkflowTemplate[], workflow: WorkflowTemplate) {
  return workflow.workId ? workflows.filter(parent => parent.id !== workflow.id && parent.nodes.some(node => node.workItemId === workflow.workId)) : [];
}

// A shared graph has one navigation row; all parent links remain available in its header.
export function workflowNavigation(workflows: WorkflowTemplate[]) {
  const parents = new Map<string, string>();
  for (const workflow of workflows) {
    const candidate = parentWorkflows(workflows, workflow)[0];
    if (!candidate) continue;
    const seen = new Set([workflow.id]);
    let ancestor: string | undefined = candidate.id;
    while (ancestor && !seen.has(ancestor)) { seen.add(ancestor); ancestor = parents.get(ancestor); }
    if (!ancestor) parents.set(workflow.id, candidate.id);
  }
  return parents;
}
