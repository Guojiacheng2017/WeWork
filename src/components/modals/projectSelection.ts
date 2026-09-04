import type { ResolvedWorkspace } from '../../domain/wework';

export const projectNameFromWorkspace = (workspace: ResolvedWorkspace) => {
  const normalized = workspace.rootPath.replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).pop() || '未命名项目';
};

export const projectWorkspaceAssignment = (workspace: ResolvedWorkspace) => ({
  kind: 'local' as const,
  rootPath: workspace.rootPath,
});
