import assert from 'node:assert/strict';
import test from 'node:test';

test('Windows integrates native caption buttons into the app toolbar', async () => {
  const windowOptions = await import('../src/window-options.mjs').catch(() => ({}));

  assert.deepEqual(windowOptions.desktopWindowChrome?.('win32'), {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#334155', height: 60 },
  });
});

test('macOS keeps its inset traffic lights', async () => {
  const windowOptions = await import('../src/window-options.mjs').catch(() => ({}));

  assert.deepEqual(windowOptions.desktopWindowChrome?.('darwin'), {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
  });
});
