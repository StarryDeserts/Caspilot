import { describe, expect, it } from 'vitest';
import { X402_VERSION } from '../src/index.js';
import * as schemas from '../src/schemas/index.js';

describe('@caspilot/x402 package skeleton', () => {
  it('exposes X402_VERSION = 2', () => {
    expect(X402_VERSION).toBe(2);
  });

  it('exposes an importable schemas barrel', () => {
    expect(typeof schemas).toBe('object');
    expect(schemas).not.toBeNull();
  });
});
