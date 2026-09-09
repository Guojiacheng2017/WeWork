import { expect, it } from 'vitest';
import { LoopbackRuntimeEvents } from './weworkHost';

it('shares a single in-flight poll across subscribers and subscription churn', async () => {
  let resolve!: (value: any) => void;
  let calls = 0;
  const host: any = { events: () => { calls++; return new Promise(r => { resolve = r; }); } };
  const events = new LoopbackRuntimeEvents(host, 100000);
  const received: string[] = [];
  const stopA = events.subscribe(() => {});
  const stopB = events.subscribe(e => received.push(e.type));
  stopA(); stopB();
  const stopC = events.subscribe(e => received.push(e.type));
  const count = calls;
  resolve({ cursor: 1, events: [{ type: 'wework.updated' }] });
  await new Promise(r => setTimeout(r, 0));
  stopC();
  expect(count).toBe(1);
  expect(received).toEqual(['wework.updated']);
});
