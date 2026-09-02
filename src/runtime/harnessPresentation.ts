import type { HarnessId } from './weworkHost';

export const harnessNames: Record<HarnessId, string> = {
  pi: 'Pi',
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  smalldashharness: 'smalldashharness（WeWork 内置）',
};

export const harnessNeedsModel = (harness: HarnessId) => harness === 'smalldashharness';
export const harnessNeedsServiceUrl = (_harness: HarnessId) => false;
export const harnessSupportsProfiles = (harness: HarnessId) => harness === 'smalldashharness';
