export const applicationMenuTemplate = ({ appName, platform, closeCurrentLayer }) => [
  ...(platform === 'darwin' ? [{
    label: appName,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }] : []),
  {
    label: '文件',
    submenu: [
      { label: '关闭当前层', accelerator: 'CommandOrControl+W', click: closeCurrentLayer },
      ...(platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ],
  },
  {
    label: '编辑',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ],
  },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
];
