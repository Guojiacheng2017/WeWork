import { describe, expect, it } from 'vitest';

import config from '../vite.config';

describe('packaged renderer configuration', () => {
  it('emits relative asset URLs so the UI loads from file://', () => {
    expect(config.base).toBe('./');
  });
});
