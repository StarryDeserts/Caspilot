import { describe, expect, it } from 'vitest';
import { canonicalJson as sharedCanonicalJson } from '@caspilot/shared';
import { canonicalJson, canonicalSha256Hex } from '../src/index.js';

describe('x402 canonical helpers', () => {
  it('re-export the shared canonical JSON behavior', () => {
    const value = { z: 1, a: { b: 2, a: 1 } };
    expect(canonicalJson(value)).toBe(sharedCanonicalJson(value));
    expect(canonicalJson(value)).toBe('{"a":{"a":1,"b":2},"z":1}');
  });

  it('keeps the existing public digest export', () => {
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
