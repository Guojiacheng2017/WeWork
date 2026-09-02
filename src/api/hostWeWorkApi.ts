import { createLocalWeWorkApi, type WeWorkStorage } from '../local/localWeWorkApi';

export type HostWeWorkBridge = { weworkCall(method: string, args: unknown[]): Promise<unknown> };
export function createHostWeWorkApi(host: HostWeWorkBridge, storage: WeWorkStorage): ReturnType<typeof createLocalWeWorkApi> {
  // Keep the browser copy as a recovery backup. Import is a no-op once Host has data.
  let migration: Promise<unknown> | undefined;
  const ready = () => migration ??= (async () => {
    const raw = storage.getItem('wework.local.v1');
    if (raw) await host.weworkCall('importLocalState', [JSON.parse(raw)]);
  })().catch((error) => { migration = undefined; throw error; });
  const local = createLocalWeWorkApi(storage);
  return new Proxy(local, {
    get(target, method: string) {
      if (method === 'eventSource') return target.eventSource;
      if (!(method in target)) return undefined;
      return async (...args: unknown[]) => { await ready(); return host.weworkCall(method, args); };
    },
  });
}
