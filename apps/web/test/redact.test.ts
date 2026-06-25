import { describe, it, expect } from 'vitest';
import { FRONTEND_FORBIDDEN_KEYS, sanitize } from '../src/lib/redact.js';

describe('FRONTEND_FORBIDDEN_KEYS', () => {
  it('covers secret material and agent reasoning channels', () => {
    for (const k of [
      'PRIVATE_KEY',
      'privateKey',
      'CSPR_CLOUD_KEY',
      'reasoning',
      'chainOfThought',
      'prompt',
    ]) {
      expect(FRONTEND_FORBIDDEN_KEYS.has(k)).toBe(true);
    }
  });
});

describe('sanitize', () => {
  it('drops forbidden keys at the top level, keeps the rest', () => {
    const out = sanitize({ amount: 500, PRIVATE_KEY: 'secret', reasoning: 'because' }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ amount: 500 });
  });

  it('drops forbidden keys nested in objects', () => {
    const out = sanitize({ body: { token: 'cep18', apiKey: 'k' } }) as Record<string, unknown>;
    expect(out).toEqual({ body: { token: 'cep18' } });
  });

  it('drops forbidden keys inside arrays of objects', () => {
    const out = sanitize({ rows: [{ ok: 1, seed: 'x' }] }) as { rows: Record<string, unknown>[] };
    expect(out.rows[0]).toEqual({ ok: 1 });
  });

  it('passes primitives and null through unchanged', () => {
    expect(sanitize('hello')).toBe('hello');
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
  });
});
