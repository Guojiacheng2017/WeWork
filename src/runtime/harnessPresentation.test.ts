import { describe, expect, it } from 'vitest';
import { harnessNeedsModel, harnessNeedsServiceUrl } from './harnessPresentation';

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
});
