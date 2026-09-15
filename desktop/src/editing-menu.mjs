/** Native roles keep clipboard and undo behavior scoped to the focused field. */
export function editingMenu({ isEditable, selectionText, editFlags = {}, inputFieldType }) {
  const selected = Boolean(selectionText?.trim());
  const password = inputFieldType === 'password';
  if (isEditable) return [
    { label: '撤销', role: 'undo', enabled: Boolean(editFlags.canUndo) },
    { label: '重做', role: 'redo', enabled: Boolean(editFlags.canRedo) },
    { type: 'separator' },
    { label: '剪切', role: 'cut', enabled: !password && Boolean(editFlags.canCut) },
    { label: '复制', role: 'copy', enabled: !password && Boolean(editFlags.canCopy) },
    { label: '粘贴', role: 'paste', enabled: Boolean(editFlags.canPaste) },
    { type: 'separator' },
    { label: '全选', role: 'selectAll', enabled: Boolean(editFlags.canSelectAll) },
  ];
  return selected ? [{ label: '复制', role: 'copy', enabled: true }, { label: '全选', role: 'selectAll' }] : [{ label: '全选', role: 'selectAll' }];
}
