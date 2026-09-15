import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationMenuTemplate } from './application-menu.mjs';

test('macOS maps Command+W to one UI layer and keeps Command+Q as quit', () => {
  const closeCurrentLayer = () => {};
  const template = applicationMenuTemplate({ appName: 'WeWork', platform: 'darwin', closeCurrentLayer });
  const close = template.find(item => item.label === '文件').submenu[0];
  assert.equal(close.accelerator, 'CommandOrControl+W');
  assert.equal(close.click, closeCurrentLayer);
  assert.ok(template[0].submenu.some(item => item.role === 'quit'));
  assert.ok(!template.find(item => item.label === '文件').submenu.some(item => item.role === 'close'));
});

test('non-macOS file menu retains a quit action', () => {
  const template = applicationMenuTemplate({ appName: 'WeWork', platform: 'win32', closeCurrentLayer() {} });
  assert.ok(template.find(item => item.label === '文件').submenu.some(item => item.role === 'quit'));
});
