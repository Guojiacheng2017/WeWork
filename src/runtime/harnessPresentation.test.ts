import { describe, expect, it } from 'vitest';
import { harnessNeedsModel, harnessNeedsServiceUrl } from './harnessPresentation';

describe('harness settings presentation', () => {
  it('shows WeWork model settings for bundled sdh, not self-managed external CLIs', () => {
    expect(harnessNeedsModel('pi')).toBe(false);
    expect(harnessNeedsModel('smalldashharness')).toBe(true);
    expect(harnessNeedsModel('claude-code')).toBe(false);
    expect(harnessNeedsModel('codex-cli')).toBe(false);
  });

  it('does not confuse bundled sdh model endpoint with a harness service URL', () => {
    expect(harnessNeedsServiceUrl('smalldashharness')).toBe(false);
    expect(harnessNeedsServiceUrl('pi')).toBe(false);
  });
});
