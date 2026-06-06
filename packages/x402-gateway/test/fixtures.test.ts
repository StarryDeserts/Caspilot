import { describe, expect, it } from 'vitest';
import { normalizeSettleResponse, normalizeVerifyResponse } from '../src/schemas/normalize.js';
import { PaymentPayloadSchema } from '../src/schemas/payment-payload.schema.js';
import {
  NormalizedSettleResponseSchema,
  WireSettleResponseSchema,
} from '../src/schemas/settle.schema.js';
import { SupportedResponseSchema } from '../src/schemas/supported.schema.js';
import {
  NormalizedVerifyResponseSchema,
  VerifyRequestSchema,
  WireVerifyResponseSchema,
} from '../src/schemas/verify.schema.js';

import paymentPayloadInvalidAddress from '../__fixtures__/payment-payload.invalid-account-address.json' with {
  type: 'json',
};
import settleNormalizedSuccess from '../__fixtures__/settle-response-success.normalized.json' with {
  type: 'json',
};
import settleWireFailure from '../__fixtures__/settle-response-failure.wire.json' with {
  type: 'json',
};
import settleWireSuccess from '../__fixtures__/settle-response-success.wire.json' with {
  type: 'json',
};
import supportedResponse from '../__fixtures__/supported-response.json' with { type: 'json' };
import verifyRequest from '../__fixtures__/verify-request.exact-casper.json' with { type: 'json' };
import verifyWireFailure from '../__fixtures__/verify-response-failure.wire.json' with {
  type: 'json',
};
import verifyWireNoPayer from '../__fixtures__/verify-response-success.wire.no-payer.json' with {
  type: 'json',
};
import verifyWireWithPayer from '../__fixtures__/verify-response-success.wire.with-payer.json' with {
  type: 'json',
};

describe('frozen official §3B.1 fixtures parse against their schemas', () => {
  it('supported-response.json → SupportedResponseSchema', () => {
    expect(SupportedResponseSchema.safeParse(supportedResponse).success).toBe(true);
  });

  it('verify-request.exact-casper.json → VerifyRequestSchema', () => {
    expect(VerifyRequestSchema.safeParse(verifyRequest).success).toBe(true);
  });

  it('verify-response-success.wire.with-payer.json → WireVerifyResponseSchema', () => {
    const parsed = WireVerifyResponseSchema.parse(verifyWireWithPayer);
    expect(parsed.isValid).toBe(true);
    if (parsed.isValid) expect(parsed.payer).toBeDefined();
  });

  it('verify-response-success.wire.no-payer.json → WireVerifyResponseSchema (payer optional)', () => {
    expect(WireVerifyResponseSchema.safeParse(verifyWireNoPayer).success).toBe(true);
  });

  it('verify-response-success.wire.no-payer.json → NormalizedVerifyResponseSchema rejects (payer required)', () => {
    expect(NormalizedVerifyResponseSchema.safeParse(verifyWireNoPayer).success).toBe(false);
  });

  it('verify-response-failure.wire.json → WireVerifyResponseSchema', () => {
    expect(WireVerifyResponseSchema.safeParse(verifyWireFailure).success).toBe(true);
  });

  it('settle-response-success.wire.json → WireSettleResponseSchema', () => {
    expect(WireSettleResponseSchema.safeParse(settleWireSuccess).success).toBe(true);
  });

  it('settle-response-failure.wire.json → WireSettleResponseSchema', () => {
    expect(WireSettleResponseSchema.safeParse(settleWireFailure).success).toBe(true);
  });

  it('settle-response-success.normalized.json → NormalizedSettleResponseSchema', () => {
    expect(NormalizedSettleResponseSchema.safeParse(settleNormalizedSuccess).success).toBe(true);
  });

  it('payment-payload.invalid-account-address.json → PaymentPayloadSchema rejects (from is publicKey form)', () => {
    expect(PaymentPayloadSchema.safeParse(paymentPayloadInvalidAddress).success).toBe(false);
  });
});

describe('fixtures round-trip through the normalizers (§3B.0)', () => {
  it('normalizeSettleResponse(settle wire) deep-equals the normalized fixture', () => {
    const wire = WireSettleResponseSchema.parse(settleWireSuccess);
    const expected = NormalizedSettleResponseSchema.parse(settleNormalizedSuccess);
    expect(normalizeSettleResponse(wire)).toEqual(expected);
  });

  it('normalizeVerifyResponse(no-payer wire, authorization.from) cross-fills payer', () => {
    const req = VerifyRequestSchema.parse(verifyRequest);
    const fallback = req.paymentPayload.payload.authorization.from;
    const wire = WireVerifyResponseSchema.parse(verifyWireNoPayer);
    const out = normalizeVerifyResponse(wire, fallback);
    expect(out.isValid).toBe(true);
    if (out.isValid) expect(out.payer).toBe(fallback);
    expect(NormalizedVerifyResponseSchema.safeParse(out).success).toBe(true);
  });
});
