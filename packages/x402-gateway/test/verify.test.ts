import { describe, expect, it } from 'vitest';
import {
  type NormalizedVerifyResponse,
  NormalizedVerifyResponseSchema,
  type VerifyRequest,
  VerifyRequestSchema,
  type WireVerifyResponse,
  WireVerifyResponseSchema,
} from '../src/schemas/verify.schema.js';

type Obj = Record<string, unknown>;

const PAYER = `00${'a'.repeat(64)}`; // CasperAccountAddressHex
const PAYTO = `00${'f'.repeat(64)}`;
const ASSET = 'd'.repeat(64); // Cep18PackageHashHex (Hex64)
const PUBKEY_ED = `01${'b'.repeat(64)}`; // CasperPublicKeyHex (Ed25519)
const SIG = 'e'.repeat(130); // CasperSignatureHex
const NONCE = 'd'.repeat(64); // Hex64
const NETWORK = 'casper:casper-test';

function paymentPayload(over: Obj = {}): Obj {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    payload: {
      signature: SIG,
      publicKey: PUBKEY_ED,
      authorization: {
        from: PAYER,
        to: PAYTO,
        value: '1000000',
        validAfter: '1700000000',
        validBefore: '1700003600',
        nonce: NONCE,
      },
    },
    ...over,
  };
}

function paymentRequirements(over: Obj = {}): Obj {
  return {
    scheme: 'exact',
    network: NETWORK,
    payTo: PAYTO,
    amount: '1000000',
    asset: ASSET,
    extra: { name: 'USD Coin', version: '1', decimals: '9' },
    maxTimeoutSeconds: 60,
    ...over,
  };
}

function verifyRequest(over: Obj = {}): Obj {
  return {
    paymentPayload: paymentPayload(),
    paymentRequirements: paymentRequirements(),
    ...over,
  };
}

describe('VerifyRequestSchema — official §3B.0 wire shape', () => {
  it('parses a valid verify request', () => {
    const result = VerifyRequestSchema.safeParse(verifyRequest());
    expect(result.success).toBe(true);
    const parsed: VerifyRequest = VerifyRequestSchema.parse(verifyRequest());
    expect(parsed.paymentPayload.scheme).toBe('exact');
    expect(parsed.paymentRequirements.payTo).toBe(PAYTO);
  });

  it('rejects a missing paymentRequirements', () => {
    const r = verifyRequest();
    delete r.paymentRequirements;
    expect(VerifyRequestSchema.safeParse(r).success).toBe(false);
  });

  it('rejects unknown root fields (strict)', () => {
    expect(VerifyRequestSchema.safeParse(verifyRequest({ foo: 'bar' })).success).toBe(false);
  });
});

describe('WireVerifyResponseSchema — facilitator wire shape', () => {
  it('parses success with payer present', () => {
    const ok: WireVerifyResponse = WireVerifyResponseSchema.parse({ isValid: true, payer: PAYER });
    expect(ok.isValid).toBe(true);
  });

  it('parses success with payer omitted (optional on the wire)', () => {
    expect(WireVerifyResponseSchema.safeParse({ isValid: true }).success).toBe(true);
  });

  it('parses failure with an invalidReason', () => {
    expect(
      WireVerifyResponseSchema.safeParse({ isValid: false, invalidReason: 'replay_detected' })
        .success,
    ).toBe(true);
  });

  it('rejects failure missing invalidReason', () => {
    expect(WireVerifyResponseSchema.safeParse({ isValid: false }).success).toBe(false);
  });

  it('rejects an unknown invalidReason', () => {
    expect(
      WireVerifyResponseSchema.safeParse({ isValid: false, invalidReason: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects a success carrying a failure-only field (mixed shape)', () => {
    expect(
      WireVerifyResponseSchema.safeParse({ isValid: true, invalidReason: 'expired' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(
      WireVerifyResponseSchema.safeParse({ isValid: true, payer: PAYER, foo: 'bar' }).success,
    ).toBe(false);
  });
});

describe('NormalizedVerifyResponseSchema — gateway-normalized shape', () => {
  it('parses success with payer present', () => {
    const ok: NormalizedVerifyResponse = NormalizedVerifyResponseSchema.parse({
      isValid: true,
      payer: PAYER,
    });
    expect(ok.isValid).toBe(true);
  });

  it('rejects success without payer (required after normalize)', () => {
    expect(NormalizedVerifyResponseSchema.safeParse({ isValid: true }).success).toBe(false);
  });

  it('parses failure with an invalidReason', () => {
    expect(
      NormalizedVerifyResponseSchema.safeParse({ isValid: false, invalidReason: 'expired' })
        .success,
    ).toBe(true);
  });

  it('rejects a success payer of the wrong (publicKey) form', () => {
    expect(
      NormalizedVerifyResponseSchema.safeParse({ isValid: true, payer: PUBKEY_ED }).success,
    ).toBe(false);
  });
});
