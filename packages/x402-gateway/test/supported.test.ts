import { describe, expect, it } from 'vitest';
import {
  type SupportedKind,
  type SupportedResponse,
  SupportedResponseSchema,
} from '../src/schemas/supported.schema.js';

type Obj = Record<string, unknown>;

const FEEPAYER = `00${'a'.repeat(64)}`; // CasperAccountAddressHex
const PUBKEY_ED = `01${'b'.repeat(64)}`; // CasperPublicKeyHex (Ed25519)

function extra(over: Obj = {}): Obj {
  return { feePayer: FEEPAYER, decimals: 9, name: 'USD Coin', version: '1', ...over };
}

function kind(over: Obj = {}): Obj {
  return {
    x402Version: 2,
    scheme: 'exact',
    network: 'casper:casper-test',
    extra: extra(),
    ...over,
  };
}

function supported(over: Obj = {}): Obj {
  return { kinds: [kind()], ...over };
}

const withKind = (k: Obj): Obj => supported({ kinds: [k] });
const withExtra = (e: Obj): Obj => withKind(kind({ extra: e }));

describe('SupportedResponseSchema — official §3B.0 wire shape', () => {
  it('parses a valid supported response with extra.decimals = 9', () => {
    const result = SupportedResponseSchema.safeParse(supported());
    expect(result.success).toBe(true);
    const parsed: SupportedResponse = SupportedResponseSchema.parse(supported());
    const first: SupportedKind | undefined = parsed.kinds[0];
    expect(first?.x402Version).toBe(2);
    expect(first?.scheme).toBe('exact');
    expect(first?.extra.feePayer).toBe(FEEPAYER);
  });

  it('parses a valid supported response with extra.decimals = "9"', () => {
    expect(SupportedResponseSchema.safeParse(withExtra(extra({ decimals: '9' }))).success).toBe(
      true,
    );
  });

  it('parses multiple kinds', () => {
    const multi = supported({ kinds: [kind(), kind({ network: 'casper:casper' })] });
    expect(SupportedResponseSchema.safeParse(multi).success).toBe(true);
  });

  it('rejects missing kinds', () => {
    const noKinds = supported();
    delete noKinds.kinds;
    expect(SupportedResponseSchema.safeParse(noKinds).success).toBe(false);
  });

  it('rejects kinds that is not an array', () => {
    expect(SupportedResponseSchema.safeParse(supported({ kinds: 'nope' })).success).toBe(false);
  });

  it('rejects a kind missing x402Version', () => {
    const k = kind();
    delete k.x402Version;
    expect(SupportedResponseSchema.safeParse(withKind(k)).success).toBe(false);
  });

  it('rejects x402Version !== 2', () => {
    expect(SupportedResponseSchema.safeParse(withKind(kind({ x402Version: 1 }))).success).toBe(
      false,
    );
  });

  it('rejects scheme !== "exact"', () => {
    expect(SupportedResponseSchema.safeParse(withKind(kind({ scheme: 'transfer' }))).success).toBe(
      false,
    );
  });

  it('rejects a network not starting with "casper:"', () => {
    expect(SupportedResponseSchema.safeParse(withKind(kind({ network: 'eip155:1' }))).success).toBe(
      false,
    );
  });

  it('rejects extra.feePayer = publicKey form "01"...', () => {
    expect(
      SupportedResponseSchema.safeParse(withExtra(extra({ feePayer: PUBKEY_ED }))).success,
    ).toBe(false);
  });

  it('rejects extra.feePayer = account-hash-... (prefixed key form)', () => {
    const bad = withExtra(extra({ feePayer: `account-hash-${'a'.repeat(64)}` }));
    expect(SupportedResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid extra.decimals values: "9.5", -1, "abc"', () => {
    expect(SupportedResponseSchema.safeParse(withExtra(extra({ decimals: '9.5' }))).success).toBe(
      false,
    );
    expect(SupportedResponseSchema.safeParse(withExtra(extra({ decimals: -1 }))).success).toBe(
      false,
    );
    expect(SupportedResponseSchema.safeParse(withExtra(extra({ decimals: 'abc' }))).success).toBe(
      false,
    );
  });

  it('rejects missing extra.name', () => {
    const e = extra();
    delete e.name;
    expect(SupportedResponseSchema.safeParse(withExtra(e)).success).toBe(false);
  });

  it('rejects missing extra.version', () => {
    const e = extra();
    delete e.version;
    expect(SupportedResponseSchema.safeParse(withExtra(e)).success).toBe(false);
  });

  it('rejects unknown root fields (strict)', () => {
    expect(SupportedResponseSchema.safeParse(supported({ foo: 'bar' })).success).toBe(false);
  });

  it('rejects unknown kind fields (strict)', () => {
    expect(SupportedResponseSchema.safeParse(withKind(kind({ foo: 'bar' }))).success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(SupportedResponseSchema.safeParse(withExtra(extra({ foo: 'bar' }))).success).toBe(false);
  });
});
