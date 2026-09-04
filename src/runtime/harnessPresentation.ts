import type { HarnessId } from './weworkHost';

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
