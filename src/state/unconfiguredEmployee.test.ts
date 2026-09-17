import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WeWorkTeam } from '../domain/wework';
const api = vi.hoisted(() => ({ assignWork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../api/weworkApi', () => ({ weworkMode: 'local', hostManagedWeWork: false, weworkApi: api, localWeWorkApi: {} }));
vi.mock('../runtime/weworkHost', () => ({ weworkHost: {}, LoopbackRuntimeEvents: class {} }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem() {} } }); });
afterEach(() => vi.unstubAllGlobals());
it('does not send or dispatch work to a pending-configuration employee', async () => {
  const { useWeWorkStore: store } = await import('./weworkStore');
  store.setState({ teams: [{ id: 'team', employees: [{ id: 'pending', activeSession: {} }] }] as WeWorkTeam[] });
  expect(await store.getState().sendWorkbenchMessage('pending', 'hello')).toBe(false);
  store.getState().dispatchWorkToEmployee('work', 'pending');
  expect(api.sendMessage).not.toHaveBeenCalled();
  expect(api.assignWork).not.toHaveBeenCalled();
  expect(store.getState().operationNotice?.message).toContain('配置');
});
