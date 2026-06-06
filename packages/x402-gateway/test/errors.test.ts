import { describe, expect, it } from 'vitest';
import { X402ErrorReasonSchema } from '../src/schemas/errors.schema.js';

const REASONS = [
  'invalid_payload',
  'invalid_scheme',
  'invalid_network',
  'invalid_asset',
  'invalid_amount',
  'expired',
  'insufficient_funds',
  'replay_detected',
  'signature_invalid',
  'unsupported_kind',
  'facilitator_unavailable',
] as const;

describe('X402ErrorReasonSchema — official §3B.0 enum', () => {
  it('accepts every official reason', () => {
    for (const r of REASONS) {
      expect(X402ErrorReasonSchema.safeParse(r).success).toBe(true);
    }
  });

  it('rejects an unknown reason', () => {
    expect(X402ErrorReasonSchema.safeParse('nope').success).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(X402ErrorReasonSchema.safeParse(42).success).toBe(false);
  });
});
