import type { HarnessId, HarnessInstallation } from './weworkHost';

export const harnessNames: Record<HarnessId, string> = {
  pi: 'Pi',
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  smalldashharness: 'smalldashharness（远程）',
};

export const harnessNeedsModel = (_harness: HarnessId) => false;
export const harnessNeedsServiceUrl = (harness: HarnessId) => harness === 'smalldashharness';
export const harnessSupportsProfiles = (harness: HarnessId) => harness === 'smalldashharness';
export const harnessCanBeAllowed = (installation: { available: boolean; executionReady?: boolean }, desktopHostAvailable: boolean) =>
  desktopHostAvailable && installation.available && installation.executionReady === true;

export const displayedHarnessInstallations = (installations: HarnessInstallation[]) => installations.some((item) => item.harness === 'smalldashharness')
  ? installations
  : [{
      id: 'remote:smalldashharness', harness: 'smalldashharness' as const, kind: 'local-service' as const,
      available: false, executionReady: false,
      capabilities: { streaming: true, resumeSession: true, cancellation: true, workspace: true, tools: true },
      configuration: { source: 'harness' as const },
    }, ...installations];
