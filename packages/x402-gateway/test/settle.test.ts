import { describe, expect, it } from 'vitest';
import {
  type NormalizedSettleResponse,
  NormalizedSettleResponseSchema,
  type SettleRequest,
  SettleRequestSchema,
  type WireSettleResponse,
  WireSettleResponseSchema,
} from '../src/schemas/settle.schema.js';

type Obj = Record<string, unknown>;

const PAYER = `00${'a'.repeat(64)}`; // CasperAccountAddressHex
const PAYTO = `00${'f'.repeat(64)}`;
const ASSET = 'd'.repeat(64); // Cep18PackageHashHex (Hex64)
const PUBKEY_ED = `01${'b'.repeat(64)}`; // CasperPublicKeyHex (Ed25519)
const SIG = 'e'.repeat(130); // CasperSignatureHex
const NONCE = 'd'.repeat(64); // Hex64
const DEPLOY = 'c'.repeat(64); // Hex64 deploy hash
const NETWORK = 'casper:casper-test';

function settleRequest(over: Obj = {}): Obj {
  return {
    paymentPayload: {
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
    },
    paymentRequirements: {
      scheme: 'exact',
      network: NETWORK,
      payTo: PAYTO,
      amount: '1000000',
      asset: ASSET,
      extra: { name: 'USD Coin', version: '1', decimals: '9' },
      maxTimeoutSeconds: 60,
    },
    ...over,
  };
}

describe('SettleRequestSchema — equals VerifyRequestSchema (§3B.0)', () => {
  it('parses a valid settle request', () => {
    const parsed: SettleRequest = SettleRequestSchema.parse(settleRequest());
    expect(parsed.paymentPayload.scheme).toBe('exact');
  });

  it('rejects unknown root fields (strict)', () => {
    expect(SettleRequestSchema.safeParse(settleRequest({ foo: 'bar' })).success).toBe(false);
  });
});

describe('WireSettleResponseSchema — facilitator wire shape', () => {
  const wireOk = { success: true, network: NETWORK, transaction: DEPLOY, payer: PAYER };

  it('parses success with a bare deploy-hash string', () => {
    const ok: WireSettleResponse = WireSettleResponseSchema.parse(wireOk);
    expect(ok.success).toBe(true);
  });

  it('parses failure with an errorReason', () => {
    expect(
      WireSettleResponseSchema.safeParse({ success: false, errorReason: 'replay_detected' })
        .success,
    ).toBe(true);
  });

  it('rejects success missing payer', () => {
    expect(
      WireSettleResponseSchema.safeParse({ success: true, network: NETWORK, transaction: DEPLOY })
        .success,
    ).toBe(false);
  });

  it('rejects a transaction that is not Hex64', () => {
    expect(
      WireSettleResponseSchema.safeParse({ ...wireOk, transaction: `hash-${DEPLOY}` }).success,
    ).toBe(false);
  });

  it('rejects a normalized-shaped success (mixed shape: transaction as object)', () => {
    expect(
      WireSettleResponseSchema.safeParse({
        success: true,
        transaction: { chainId: NETWORK, deployHash: DEPLOY },
        payer: PAYER,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(WireSettleResponseSchema.safeParse({ ...wireOk, foo: 'bar' }).success).toBe(false);
  });
});

describe('NormalizedSettleResponseSchema — gateway-normalized shape', () => {
  const normOk = {
    success: true,
    transaction: { chainId: NETWORK, deployHash: DEPLOY },
    payer: PAYER,
  };

  it('parses success with a nested {chainId, deployHash} object', () => {
    const ok: NormalizedSettleResponse = NormalizedSettleResponseSchema.parse(normOk);
    expect(ok.success).toBe(true);
  });

  it('parses failure with an errorReason', () => {
    expect(
      NormalizedSettleResponseSchema.safeParse({ success: false, errorReason: 'expired' }).success,
    ).toBe(true);
  });

  it('rejects a wire-shaped success (mixed shape: bare string + network)', () => {
    expect(
      NormalizedSettleResponseSchema.safeParse({
        success: true,
        network: NETWORK,
        transaction: DEPLOY,
        payer: PAYER,
      }).success,
    ).toBe(false);
  });

  it('rejects a nested transaction with unknown inner fields (strict)', () => {
    expect(
      NormalizedSettleResponseSchema.safeParse({
        ...normOk,
        transaction: { chainId: NETWORK, deployHash: DEPLOY, foo: 'bar' },
      }).success,
    ).toBe(false);
  });
});
