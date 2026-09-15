import { describe, expect, it } from 'vitest';
import type { WorkflowTemplate } from '../../domain/wework';
import { parentWorkflows, workflowNavigation } from './graphHierarchy';
const graph = (id: string, workId?: string, owns?: string): WorkflowTemplate => ({id,name:id,description:'',workId,nodes:owns?[{id:`${id}-node`,label:'Task',roleName:'Role',stepNumber:1,status:'ready',workItemId:owns}]:[]});
describe('task graph navigation', () => {
  it('groups by the owning task rather than employee and keeps standalone task graphs reachable', () => {
    const root=graph('root',undefined,'task'),child=graph('child','task','subtask'),nested=graph('nested','subtask'),orphan=graph('orphan','missing');
    const parents=workflowNavigation([root,child,nested,orphan]);
    expect(parents.get('child')).toBe('root');expect(parents.get('nested')).toBe('child');expect(parents.has('orphan')).toBe(false);
  });
  it('keeps a shared graph in one navigation location and exposes every parent for return links', () => {
    const a=graph('a',undefined,'task'),b=graph('b',undefined,'task'),child=graph('child','task');
    expect(parentWorkflows([a,b,child],child).map(x=>x.id)).toEqual(['a','b']);expect(workflowNavigation([a,b,child]).get('child')).toBe('a');
  });
  it('does not hide graphs or recurse indefinitely on cyclic or self references', () => {
    const a=graph('a','b-task','a-task'),b=graph('b','a-task','b-task'),self=graph('self','self-task','self-task');
    const parents=workflowNavigation([a,b,self]);expect(parents.size).toBe(1);expect(parents.has('self')).toBe(false);
  });
});
