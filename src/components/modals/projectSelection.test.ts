import { describe, expect, it } from 'vitest';
import { projectNameFromWorkspace, projectWorkspaceAssignment } from './projectSelection';

describe('project selection', () => {
  it('uses the selected project directory name on macOS/Linux and Windows', () => {
    expect(projectNameFromWorkspace({ kind: 'local', rootPath: '/Users/me/code/vision-app/' })).toBe('vision-app');
    expect(projectNameFromWorkspace({ kind: 'local', rootPath: 'C:\\work\\risk-engine' })).toBe('risk-engine');
  });

  it('binds the team directly to the one selected project path', () => {
    expect(projectWorkspaceAssignment({ kind: 'local', rootPath: '/repo' })).toEqual({ kind: 'local', rootPath: '/repo' });
  });
});
