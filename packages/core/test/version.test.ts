import { describe, it, expect } from 'vitest';
import { CASPILOT_VERSION } from '../src/version.js';

describe('CASPILOT_VERSION', () => {
  it('is the published constant', () => {
    expect(CASPILOT_VERSION).toBe('0.0.0');
  });
});
