import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  recovered: [] as any[],
  completeCurrent: vi.fn(), cancelWork: vi.fn(), sendAssistantMessage: vi.fn(),
}));
vi.mock('../api/weworkApi', () => {
  const api = {
    snapshot: async () => ({ teams: [{ id: 'team', employees: [{ id: 'employee', currentWorkItem: { id: 'work' }, activeSession: { messages: [] } }], pendingWorks: [] }], eventCursor: 0 }),
    listRuntimeProfiles: async () => ({ profiles: [] }),
    completeCurrent: fixture.completeCurrent, cancelWork: fixture.cancelWork, sendAssistantMessage: fixture.sendAssistantMessage,
  };
  return { weworkMode: 'remote', hostManagedWeWork: false, weworkApi: api, localWeWorkApi: api };
});
vi.mock('../runtime/localRunScheduler', () => ({ LocalRunScheduler: class { async recover() { return fixture.recovered; } } }));
vi.mock('../runtime/weworkHost', () => ({ weworkHost: { startRun() {} }, LoopbackRuntimeEvents: class {} }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem() {} } });
});
afterEach(() => vi.unstubAllGlobals());

it('hydrating a running remote execution must not cancel its task', async () => {
  fixture.recovered = [{ employeeId: 'employee', runId: 'run', status: 'running' }];
  const { useWeWorkStore } = await import('./weworkStore');
  await useWeWorkStore.getState().hydrate();
  expect(useWeWorkStore.getState().serviceStatus).toBe('ready');
  expect(fixture.cancelWork).not.toHaveBeenCalled();
  expect(fixture.completeCurrent).not.toHaveBeenCalled();
});

it('recovering a finished conversation saves its reply without completing another task', async () => {
  fixture.recovered = [{ employeeId: 'employee', runId: 'run', status: 'succeeded', promptRun: true, finalText: 'Recovered reply' }];
  const { useWeWorkStore } = await import('./weworkStore');
  await useWeWorkStore.getState().hydrate();
  expect(fixture.completeCurrent).not.toHaveBeenCalled();
  expect(fixture.cancelWork).not.toHaveBeenCalled();
  expect(fixture.sendAssistantMessage).toHaveBeenCalledWith('employee', 'Recovered reply');
});
