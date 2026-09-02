import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSmalldashPersona } from '../src/smalldash-runtime.js';

test('smalldash persona applies global, team, employee, then Session instructions before assigned Skills', () => {
  const value = buildSmalldashPersona({
    runtimeProfile: { systemPrompt: 'Runtime prompt' },
    weworkPrompts: [{ scope: 'global', content: 'Global prompt' }, { scope: 'team', content: 'Team prompt' }, { scope: 'employee', content: 'Employee prompt' }],
    employee: { displayName: 'Worker', roleName: 'Analyst' },
  }, { loaded: [{ id: 'review', content: 'Review skill' }], unloaded: [] });
  assert.match(value, /Global prompt[\s\S]*Team prompt[\s\S]*Employee prompt[\s\S]*Runtime prompt[\s\S]*Assigned skill review/);
});
