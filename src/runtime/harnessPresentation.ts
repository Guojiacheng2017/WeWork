import type { HarnessId, HarnessInstallation } from './weworkHost';

export const harnessNames: Record<HarnessId, string> = {
  pi: 'Pi',
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  smalldashharness: '未支持的执行器',
};

export const harnessNeedsModel = (_harness: HarnessId) => false;
export const harnessNeedsServiceUrl = (_harness: HarnessId) => false;
export const harnessSupportsProfiles = (_harness: HarnessId) => false;
export const harnessCanBeAllowed = (installation: { available: boolean; executionReady?: boolean }, desktopHostAvailable: boolean) =>
  desktopHostAvailable && installation.available && installation.executionReady === true;

export const displayedHarnessInstallations = (installations: HarnessInstallation[]) => installations.filter(item => item.harness !== 'smalldashharness');
