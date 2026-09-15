export function desktopWindowChrome(platform) {
  if (platform === 'win32') return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#334155', height: 60 },
  };
  if (platform === 'darwin') return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
  };
  return {};
}
