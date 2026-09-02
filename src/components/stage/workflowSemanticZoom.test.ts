import { describe, expect, it } from 'vitest';
import { clampDagZoom, dagNodeDisplayMode } from './workflowSemanticZoom';

describe('workflow semantic zoom', () => {
  it('keeps cards at 55% and switches to avatars below it', () => {
    expect(dagNodeDisplayMode(0.55)).toBe('card');
    expect(dagNodeDisplayMode(0.549)).toBe('avatar');
  });

  it('allows the canvas to zoom below the semantic threshold', () => {
    expect(clampDagZoom(0.1)).toBe(0.25);
    expect(clampDagZoom(2)).toBe(1.45);
  });
});
