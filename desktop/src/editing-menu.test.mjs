import test from 'node:test';
import assert from 'node:assert/strict';
import { editingMenu } from './editing-menu.mjs';
test('read-only selection offers copy without paste', () => {
  const menu = editingMenu({ selectionText: '消息与路径' });
  assert.equal(menu.find(item => item.role === 'copy')?.enabled, true);
  assert.equal(menu.some(item => item.role === 'paste'), false);
});
test('editable context obeys native edit capabilities', () => {
  const menu = editingMenu({ isEditable: true, editFlags: { canPaste: true, canUndo: true } });
  assert.equal(menu.find(item => item.role === 'paste').enabled, true);
  assert.equal(menu.find(item => item.role === 'copy').enabled, false);
  assert.equal(menu.find(item => item.role === 'undo').enabled, true);
});
