import { expect, test } from 'vitest';
import { createHostWeWorkApi } from './hostWeWorkApi';
import { createLocalWeWorkApi, MemoryWeWorkStorage } from '../local/localWeWorkApi';

test('imports legacy browser data once, keeps backup and never overwrites Host changes', async () => {
  const browser = new MemoryWeWorkStorage(), hostStorage = new MemoryWeWorkStorage();
  await createLocalWeWorkApi(browser).createTeam({ name: 'Legacy' });
  const host = createLocalWeWorkApi(hostStorage);
  const bridge = { weworkCall: async (method: string, args: unknown[]) => (host[method as keyof typeof host] as (...a: unknown[]) => unknown)(...args) };
  const api = createHostWeWorkApi(bridge, browser);
  expect((await api.snapshot()).teams[0].name).toBe('Legacy');
  await api.createTeam({ name: 'New' });
  const reloaded = createHostWeWorkApi(bridge, browser);
  expect((await reloaded.snapshot()).teams.map((t) => t.name)).toEqual(['Legacy', 'New']);
  expect((await createLocalWeWorkApi(browser).snapshot()).teams).toHaveLength(1);
});

test('rejects an unsafe legacy browser snapshot before Host persistence', async () => {
  const browser = new MemoryWeWorkStorage(), hostStorage = new MemoryWeWorkStorage();
  browser.setItem('wework.local.v1', JSON.stringify({ teams: [{ id: '../escape', name: 'Unsafe', employees: [], pendingWorks: [], workspaceAssignment: { kind: 'local', rootPath: 'relative' } }], runtimeProfiles: [], eventCursor: 0 }));
  const host = createLocalWeWorkApi(hostStorage);
  const bridge = { weworkCall: async (method: string, args: unknown[]) => (host[method as keyof typeof host] as (...a: unknown[]) => unknown)(...args) };
  await expect(createHostWeWorkApi(bridge, browser).snapshot()).rejects.toThrow();
  expect(hostStorage.getItem('wework.local.v1')).toBeNull();
});
