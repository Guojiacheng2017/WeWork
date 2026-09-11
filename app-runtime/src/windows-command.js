export function windowsCommandInvocation(file, args, wrapperPath) {
  if (!/\.(?:cmd|bat)$/i.test(file)) return { file, args };
  if (!wrapperPath) throw new Error('Windows command wrapper is unavailable');
  return {
    file: 'powershell.exe',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath, file, ...args],
  };
}
