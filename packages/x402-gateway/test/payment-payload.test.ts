import { describe, expect, it } from 'vitest';
import {
  type PaymentPayload,
  PaymentPayloadSchema,
} from '../src/schemas/payment-payload.schema.js';

type Obj = Record<string, unknown>;

const ACCOUNT_FROM = `00${'a'.repeat(64)}`; // CasperAccountAddressHex
const ACCOUNT_TO = `00${'f'.repeat(64)}`;
const PUBKEY_ED = `01${'b'.repeat(64)}`; // CasperPublicKeyHex (Ed25519)
const SIG = 'e'.repeat(130); // CasperSignatureHex
const NONCE = 'd'.repeat(64); // Hex64
const NETWORK = 'casper:casper-test';

function auth(over: Obj = {}): Obj {
  return {
    from: ACCOUNT_FROM,
    to: ACCOUNT_TO,
    value: '1000000',
    validAfter: '1700000000',
    validBefore: '1700003600',
    nonce: NONCE,
    ...over,
  };
}

function inner(over: Obj = {}): Obj {
  return {
    signature: SIG,
    publicKey: PUBKEY_ED,
    authorization: auth(),
    ...over,
  };
}

function payload(over: Obj = {}): Obj {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    payload: inner(),
    ...over,
  };
}

const withAuth = (a: Obj): Obj => payload({ payload: inner({ authorization: a }) });
const withInner = (i: Obj): Obj => payload({ payload: i });

describe('PaymentPayloadSchema — official §3B.0 wire shape', () => {
  it('parses a valid official-shaped PaymentPayload', () => {
    const result = PaymentPayloadSchema.safeParse(payload());
    expect(result.success).toBe(true);
    const parsed: PaymentPayload = PaymentPayloadSchema.parse(payload());
    expect(parsed.x402Version).toBe(2);
    expect(parsed.scheme).toBe('exact');
    expect(parsed.payload.authorization.nonce).toBe(NONCE);
  });

  it('rejects a flat payload without authorization nesting', () => {
    const flat = payload({ payload: { signature: SIG, publicKey: PUBKEY_ED, ...auth() } });
    expect(PaymentPayloadSchema.safeParse(flat).success).toBe(false);
  });

  it('rejects authorization missing nonce', () => {
    const a = auth();
    delete a.nonce;
    expect(PaymentPayloadSchema.safeParse(withAuth(a)).success).toBe(false);
  });

  it('rejects authorization.from = account-hash-... (prefixed key form)', () => {
    const bad = withAuth(auth({ from: `account-hash-${'a'.repeat(64)}` }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects authorization.from = publicKey form "01"...', () => {
    const bad = withAuth(auth({ from: PUBKEY_ED }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects payload.publicKey = account-address form "00"...', () => {
    const bad = withInner(inner({ publicKey: ACCOUNT_FROM }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-digit authorization.value', () => {
    const bad = withAuth(auth({ value: '10a0' }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a network not starting with "casper:"', () => {
    expect(PaymentPayloadSchema.safeParse(payload({ network: 'eip155:1' })).success).toBe(false);
  });

  it('rejects x402Version !== 2', () => {
    expect(PaymentPayloadSchema.safeParse(payload({ x402Version: 1 })).success).toBe(false);
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(PaymentPayloadSchema.safeParse(payload({ foo: 'bar' })).success).toBe(false);
  });

  it('rejects unknown fields inside payload (strict)', () => {
    const bad = withInner(inner({ extra: 'nope' }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown fields inside authorization (strict)', () => {
    const bad = withAuth(auth({ extra: 'nope' }));
    expect(PaymentPayloadSchema.safeParse(bad).success).toBe(false);
  });
});
