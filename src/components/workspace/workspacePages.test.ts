import { describe, expect, it } from 'vitest';
import { initialDesk, openPage, closePage, clampRatio, readDesks } from './workspacePages';

describe('workspace pages', () => {
  it('opens a chooser independently of existing pages', () => {
    const desk = openPage(initialDesk(false), { id: 'new', kind: 'blank', title: '新页面' });
    expect(desk.active).toBe('new');
    expect(desk.pages.map(page => page.kind)).toEqual(['overview', 'blank']);
  });
  it('reuses existing conversation pages', () => {
    const desk = openPage(initialDesk(true), { id: 'other', kind: 'session', sessionId: 'private', title: '私聊' });
    expect(desk.pages).toHaveLength(1);
    expect(desk.active).toBe('private');
  });
  it('closing a page selects its neighbor and allows an empty desk', () => {
    const desk = openPage(initialDesk(true), { id: 'settings', kind: 'settings', title: '助手设置' });
    expect(closePage(desk, 'settings').active).toBe('private');
    expect(closePage(initialDesk(true), 'private').pages).toEqual([]);
  });
  it('restores team management tabs and reopens an empty desk', () => {
    let desk = closePage(initialDesk(false), 'overview');
    for (const kind of ['members', 'performance', 'service'] as const) {
      desk = openPage(desk, { id: kind, kind, title: kind });
    }
    const restored = readDesks(JSON.stringify({ team: desk })).team;
    expect(restored).toEqual(desk);
    expect(openPage(restored, { id: 'duplicate', kind: 'members', title: '成员职责' }).pages).toHaveLength(3);
    expect(restored.active).toBe('service');
  });
  it('clamps normal layout and rejects malformed persisted desks', () => {
    expect(clampRatio(0.9)).toBe(0.5);
    expect(clampRatio(0.1)).toBe(1 / 3);
    expect(readDesks('{"bad":42}')).toEqual({});
    expect(readDesks('invalid')).toEqual({});
  });
});
