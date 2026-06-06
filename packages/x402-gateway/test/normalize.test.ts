import { describe, expect, it } from 'vitest';
import { normalizeSettleResponse, normalizeVerifyResponse } from '../src/schemas/normalize.js';
import {
  NormalizedSettleResponseSchema,
  type WireSettleResponse,
} from '../src/schemas/settle.schema.js';
import {
  NormalizedVerifyResponseSchema,
  type WireVerifyResponse,
} from '../src/schemas/verify.schema.js';

const PAYER = `00${'a'.repeat(64)}`; // wire payer
const FALLBACK = `00${'b'.repeat(64)}`; // authorization.from cross-fill
const DEPLOY = 'c'.repeat(64); // Hex64 deploy hash
const NETWORK = 'casper:casper-test';

describe('normalizeVerifyResponse — cross-fills payer from fallback (§3B.0)', () => {
  it('keeps the wire payer when present', () => {
    const wire: WireVerifyResponse = { isValid: true, payer: PAYER };
    const out = normalizeVerifyResponse(wire, FALLBACK);
    expect(out.isValid).toBe(true);
    if (out.isValid) expect(out.payer).toBe(PAYER);
    expect(NormalizedVerifyResponseSchema.safeParse(out).success).toBe(true);
  });

  it('fills payer from the fallback when the wire omits it', () => {
    const wire: WireVerifyResponse = { isValid: true };
    const out = normalizeVerifyResponse(wire, FALLBACK);
    expect(out.isValid).toBe(true);
    if (out.isValid) expect(out.payer).toBe(FALLBACK);
    expect(NormalizedVerifyResponseSchema.safeParse(out).success).toBe(true);
  });

  it('passes an invalid reason through unchanged', () => {
    const wire: WireVerifyResponse = { isValid: false, invalidReason: 'signature_invalid' };
    const out = normalizeVerifyResponse(wire, FALLBACK);
    expect(out.isValid).toBe(false);
    if (!out.isValid) expect(out.invalidReason).toBe('signature_invalid');
  });
});

describe('normalizeSettleResponse — collapses bare hash to nested object (§3B.0)', () => {
  it('builds {chainId, deployHash} from the wire network + transaction', () => {
    const wire: WireSettleResponse = {
      success: true,
      network: NETWORK,
      transaction: DEPLOY,
      payer: PAYER,
    };
    const out = normalizeSettleResponse(wire);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.transaction).toEqual({ chainId: NETWORK, deployHash: DEPLOY });
      expect(out.payer).toBe(PAYER);
    }
    expect(NormalizedSettleResponseSchema.safeParse(out).success).toBe(true);
  });

  it('passes a failure reason through unchanged', () => {
    const wire: WireSettleResponse = { success: false, errorReason: 'facilitator_unavailable' };
    const out = normalizeSettleResponse(wire);
    expect(out.success).toBe(false);
    if (!out.success) expect(out.errorReason).toBe('facilitator_unavailable');
  });
});
