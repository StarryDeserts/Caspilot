import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalSha256Hex } from '../src/index.js';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 2, a: { z: 1, y: 0 } })).toBe('{"a":{"y":0,"z":1},"b":2}');
  });

  it('preserves array order because arrays can be semantically ordered', () => {
    expect(canonicalJson({ values: [{ b: 2, a: 1 }, { a: 3 }] })).toBe(
      '{"values":[{"a":1,"b":2},{"a":3}]}',
    );
  });

  it('preserves atomic amount strings exactly', () => {
    expect(canonicalJson({ amount: '000123', nested: { cap: '5000' } })).toBe(
      '{"amount":"000123","nested":{"cap":"5000"}}',
    );
  });

  it('preserves JSON __proto__ keys as data keys', () => {
    const parsed = JSON.parse('{"__proto__":{"x":1},"a":2}');
    expect(canonicalJson(parsed)).toBe('{"__proto__":{"x":1},"a":2}');
  });
});

describe('canonicalSha256Hex', () => {
  it('hashes the canonical JSON string as lowercase hex', () => {
    const canonical = '{"a":1,"b":2}';
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toBe(sha256Hex(canonical));
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
