import assert from 'node:assert/strict';
import test from 'node:test';
import { weworkDataLayout } from '../src/data-layout.mjs';

test('desktop stores WeWork data in Documents and keeps device metadata in .wework', () => {
  assert.deepEqual(weworkDataLayout('/Users/ada/Documents'), {
    rootPath: '/Users/ada/Documents/WeWork',
    configPath: '/Users/ada/Documents/.wework',
    teamsPath: '/Users/ada/Documents/WeWork/teams',
    runtimePath: '/Users/ada/Documents/.wework/runtime',
  });
});
