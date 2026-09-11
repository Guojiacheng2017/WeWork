import { describe, expect, it } from 'vitest';
import { displayedHarnessInstallations, harnessCanBeAllowed, harnessNeedsModel, harnessNeedsServiceUrl } from './harnessPresentation';
import type { HarnessInstallation } from './weworkHost';

describe('harness settings presentation', () => {
  it('lets remote sdh manage its own model catalog', () => {
    expect(harnessNeedsModel('pi')).toBe(false);
    expect(harnessNeedsModel('smalldashharness')).toBe(false);
    expect(harnessNeedsModel('claude-code')).toBe(false);
    expect(harnessNeedsModel('codex-cli')).toBe(false);
  });

  it('requires a service URL only for remote sdh', () => {
    expect(harnessNeedsServiceUrl('smalldashharness')).toBe(true);
    expect(harnessNeedsServiceUrl('pi')).toBe(false);
  });

  it('allows every verified executable adapter and rejects inventory-only CLIs', () => {
    expect(harnessCanBeAllowed({ available: true, executionReady: true }, true)).toBe(true);
    expect(harnessCanBeAllowed({ available: true, executionReady: false }, true)).toBe(false);
    expect(harnessCanBeAllowed({ available: true, executionReady: true }, false)).toBe(false);
  });

  it('keeps unavailable Pi visible so settings can show its detection failure', () => {
    const pi: HarnessInstallation = {
      id: 'harness:pi', harness: 'pi', kind: 'executable', available: false, executionReady: false,
      reason: 'where.exe pi failed',
      capabilities: { streaming: false, resumeSession: false, cancellation: false, workspace: false, tools: false },
    };

    expect(displayedHarnessInstallations([pi])).toContainEqual(pi);
  });
});
