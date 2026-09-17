export type WorkspacePage = { id: string; kind: 'blank' | 'session' | 'settings' | 'overview' | 'group' | 'pending' | 'teamSettings' | 'details' | 'nodeConfig' | 'members' | 'performance' | 'service'; title: string; sessionId?: string };
export type WorkspaceDesk = { pages: WorkspacePage[]; active: string };
export type WorkspaceDesks = Record<string, WorkspaceDesk>;
export const deskKey = (teamId: string, employeeId?: string | null) => JSON.stringify([teamId, employeeId ?? 'team']);
export const clampRatio = (ratio: number) => Number.isFinite(ratio) ? Math.max(1 / 3, Math.min(0.5, ratio)) : 0.42;
export function initialDesk(employee: boolean): WorkspaceDesk {
  const page: WorkspacePage = employee ? { id: 'private', kind: 'session', sessionId: 'private', title: '私聊' } : { id: 'overview', kind: 'overview', title: '团队概览' };
  return { pages: [page], active: page.id };
}
export function openPage(desk: WorkspaceDesk, page: WorkspacePage): WorkspaceDesk {
  const existing = page.kind !== 'blank' && desk.pages.find(item => item.kind === page.kind && item.sessionId === page.sessionId);
  if (existing) return { ...desk, active: existing.id };
  const active = desk.pages.find(item => item.id === desk.active);
  return { pages: active?.kind === 'blank' && page.kind !== 'blank' ? desk.pages.map(item => item.id === active.id ? page : item) : [...desk.pages, page], active: page.id };
}
export function closePage(desk: WorkspaceDesk, id: string): WorkspaceDesk {
  const index = desk.pages.findIndex(page => page.id === id);
  const pages = desk.pages.filter(page => page.id !== id);
  return { pages, active: desk.active === id ? pages[Math.max(0, index - 1)]?.id ?? '' : desk.active };
}
export function readDesks(raw: string | null): WorkspaceDesks {
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, item]) => {
      const desk = item as WorkspaceDesk;
      return desk && typeof desk.active === 'string' && Array.isArray(desk.pages) && desk.pages.every(page => page && typeof page.id === 'string' && typeof page.title === 'string' && ['blank', 'session', 'settings', 'overview', 'group', 'pending', 'teamSettings', 'details', 'nodeConfig', 'members', 'performance', 'service'].includes(page.kind) && (page.kind !== 'session' || typeof page.sessionId === 'string'));
    })) as WorkspaceDesks;
  } catch { return {}; }
}
