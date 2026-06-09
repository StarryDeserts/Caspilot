import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalJsonString } from '../src/canonical-json.js';

describe('canonical JSON', () => {
  it('sorts object keys', () => {
    expect(canonicalize({ b: 1, a: { z: 0, y: -1 } })).toEqual({ a: { y: -1, z: 0 }, b: 1 });
  });
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });
  it('produces stable strings', () => {
    expect(canonicalJsonString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
