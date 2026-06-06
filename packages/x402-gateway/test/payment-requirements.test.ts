import { describe, expect, it } from 'vitest';
import {
  type PaymentRequirements,
  PaymentRequirementsSchema,
} from '../src/schemas/payment-requirements.schema.js';

type Obj = Record<string, unknown>;

const PAYTO = `00${'a'.repeat(64)}`; // CasperAccountAddressHex
const ASSET = 'd'.repeat(64); // Cep18PackageHashHex (Hex64)
const PUBKEY_ED = `01${'b'.repeat(64)}`; // CasperPublicKeyHex (Ed25519)

function extra(over: Obj = {}): Obj {
  return { name: 'USD Coin', version: '1', decimals: '9', ...over };
}

function reqs(over: Obj = {}): Obj {
  return {
    scheme: 'exact',
    network: 'casper:casper-test',
    payTo: PAYTO,
    amount: '1000000',
    asset: ASSET,
    extra: extra(),
    maxTimeoutSeconds: 60,
    ...over,
  };
}

const withExtra = (e: Obj): Obj => reqs({ extra: e });

describe('PaymentRequirementsSchema — official §3B.0 wire shape', () => {
  it('parses valid official-shaped requirements with extra.decimals = "9"', () => {
    const result = PaymentRequirementsSchema.safeParse(reqs());
    expect(result.success).toBe(true);
    const parsed: PaymentRequirements = PaymentRequirementsSchema.parse(reqs());
    expect(parsed.scheme).toBe('exact');
    expect(parsed.payTo).toBe(PAYTO);
    expect(parsed.maxTimeoutSeconds).toBe(60);
    expect(parsed.extra.decimals).toBe('9');
  });

  it('parses valid official-shaped requirements with extra.decimals = 9', () => {
    const ok = withExtra(extra({ decimals: 9 }));
    expect(PaymentRequirementsSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects scheme !== "exact"', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ scheme: 'transfer' })).success).toBe(false);
  });

  it('rejects a network not starting with "casper:"', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ network: 'eip155:1' })).success).toBe(false);
  });

  it('rejects payTo = publicKey form "01"...', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ payTo: PUBKEY_ED })).success).toBe(false);
  });

  it('rejects payTo = account-hash-... (prefixed key form)', () => {
    const bad = reqs({ payTo: `account-hash-${'a'.repeat(64)}` });
    expect(PaymentRequirementsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an amount with non-digit characters', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ amount: '10a0' })).success).toBe(false);
  });

  it('rejects an asset with a hash- prefix', () => {
    const bad = reqs({ asset: `hash-${'d'.repeat(64)}` });
    expect(PaymentRequirementsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an asset whose length != 64', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ asset: 'd'.repeat(63) })).success).toBe(
      false,
    );
    expect(PaymentRequirementsSchema.safeParse(reqs({ asset: 'd'.repeat(65) })).success).toBe(
      false,
    );
  });

  it('rejects missing extra.decimals', () => {
    const e = extra();
    delete e.decimals;
    expect(PaymentRequirementsSchema.safeParse(withExtra(e)).success).toBe(false);
  });

  it('rejects invalid extra.decimals values: "9.5", -1, "abc"', () => {
    expect(PaymentRequirementsSchema.safeParse(withExtra(extra({ decimals: '9.5' }))).success).toBe(
      false,
    );
    expect(PaymentRequirementsSchema.safeParse(withExtra(extra({ decimals: -1 }))).success).toBe(
      false,
    );
    expect(PaymentRequirementsSchema.safeParse(withExtra(extra({ decimals: 'abc' }))).success).toBe(
      false,
    );
  });

  it('rejects maxTimeoutSeconds <= 0', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ maxTimeoutSeconds: 0 })).success).toBe(false);
    expect(PaymentRequirementsSchema.safeParse(reqs({ maxTimeoutSeconds: -1 })).success).toBe(
      false,
    );
  });

  it('rejects unknown root fields (strict)', () => {
    expect(PaymentRequirementsSchema.safeParse(reqs({ foo: 'bar' })).success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(PaymentRequirementsSchema.safeParse(withExtra(extra({ foo: 'bar' }))).success).toBe(
      false,
    );
  });
});
