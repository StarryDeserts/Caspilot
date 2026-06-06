import { describe, expect, it } from 'vitest';
import {
  AtomicDecimalString,
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  CasperPublicKeyHex,
  CasperSignatureHex,
  Cep18PackageHashHex,
  DecimalsField,
  Hex64,
  UnixSecondsString,
  X402Scheme,
  X402Version,
  decimalsToNumber,
} from '../src/schemas/primitives.schema.js';

const ACCOUNT = `00${'a'.repeat(64)}`; // "00" + 64 hex
const PUBKEY_ED = `01${'b'.repeat(64)}`; // "01" + 64 hex (Ed25519)
const PUBKEY_SECP = `02${'c'.repeat(66)}`; // "02" + 66 hex (Secp256k1)
const HEX64 = 'd'.repeat(64);
const SIG = 'e'.repeat(130);

describe('Hex64', () => {
  it('accepts exactly 64 lowercase hex chars', () => {
    expect(Hex64.safeParse(HEX64).success).toBe(true);
  });
  it('rejects 63 / 65 hex chars', () => {
    expect(Hex64.safeParse('d'.repeat(63)).success).toBe(false);
    expect(Hex64.safeParse('d'.repeat(65)).success).toBe(false);
  });
  it('rejects uppercase hex', () => {
    expect(Hex64.safeParse('D'.repeat(64)).success).toBe(false);
  });
  it('rejects a 0x-prefixed value', () => {
    expect(Hex64.safeParse(`0x${'d'.repeat(62)}`).success).toBe(false);
  });
});

describe('CasperAccountAddressHex', () => {
  it('accepts "00" + 64 hex', () => {
    expect(CasperAccountAddressHex.safeParse(ACCOUNT).success).toBe(true);
  });
  it('rejects "01" + 64 hex (Ed25519 publicKey form)', () => {
    expect(CasperAccountAddressHex.safeParse(PUBKEY_ED).success).toBe(false);
  });
  it('rejects "02" + 66 hex (Secp256k1 publicKey form)', () => {
    expect(CasperAccountAddressHex.safeParse(PUBKEY_SECP).success).toBe(false);
  });
  it('rejects an account-hash- prefixed key form', () => {
    expect(CasperAccountAddressHex.safeParse(`account-hash-${'a'.repeat(64)}`).success).toBe(false);
  });
  it('rejects a publicKey value verbatim (publicKey-vs-accountAddress)', () => {
    expect(CasperAccountAddressHex.safeParse(PUBKEY_ED).success).toBe(false);
    expect(CasperAccountAddressHex.safeParse(PUBKEY_SECP).success).toBe(false);
  });
});

describe('CasperPublicKeyHex', () => {
  it('accepts "01" + 64 hex (Ed25519)', () => {
    expect(CasperPublicKeyHex.safeParse(PUBKEY_ED).success).toBe(true);
  });
  it('accepts "02" + 66 hex (Secp256k1)', () => {
    expect(CasperPublicKeyHex.safeParse(PUBKEY_SECP).success).toBe(true);
  });
  it('rejects "00" + 64 hex (account-address form)', () => {
    expect(CasperPublicKeyHex.safeParse(ACCOUNT).success).toBe(false);
  });
  it('rejects an account-address value verbatim (publicKey-vs-accountAddress)', () => {
    expect(CasperPublicKeyHex.safeParse(ACCOUNT).success).toBe(false);
  });
});

describe('CasperSignatureHex', () => {
  it('parses a signature of exactly 130 lowercase hex chars', () => {
    expect(CasperSignatureHex.safeParse(SIG).success).toBe(true);
  });
  it('rejects a signature of 128 hex chars', () => {
    expect(CasperSignatureHex.safeParse('e'.repeat(128)).success).toBe(false);
  });
  it('rejects a signature of 132 hex chars', () => {
    expect(CasperSignatureHex.safeParse('e'.repeat(132)).success).toBe(false);
  });
  it('rejects uppercase hex in a signature', () => {
    expect(CasperSignatureHex.safeParse('E'.repeat(130)).success).toBe(false);
  });
});

describe('Cep18PackageHashHex', () => {
  it('accepts a raw 64-hex package hash', () => {
    expect(Cep18PackageHashHex.safeParse(HEX64).success).toBe(true);
  });
  it('rejects a hash- prefixed key form', () => {
    expect(Cep18PackageHashHex.safeParse(`hash-${'a'.repeat(64)}`).success).toBe(false);
  });
});

describe('CasperCaip2ChainId', () => {
  it('accepts "casper:<chainspec>"', () => {
    expect(CasperCaip2ChainId.safeParse('casper:casper-test').success).toBe(true);
  });
  it('rejects a bare "casper:" with empty chainspec', () => {
    expect(CasperCaip2ChainId.safeParse('casper:').success).toBe(false);
  });
  it('rejects a non-casper namespace', () => {
    expect(CasperCaip2ChainId.safeParse('eip155:1').success).toBe(false);
  });
});

describe('AtomicDecimalString', () => {
  it('accepts digit-only strings', () => {
    expect(AtomicDecimalString.safeParse('0').success).toBe(true);
    expect(AtomicDecimalString.safeParse('1000000').success).toBe(true);
  });
  it('rejects negative, fractional, non-numeric, and empty strings', () => {
    expect(AtomicDecimalString.safeParse('-1').success).toBe(false);
    expect(AtomicDecimalString.safeParse('1.5').success).toBe(false);
    expect(AtomicDecimalString.safeParse('abc').success).toBe(false);
    expect(AtomicDecimalString.safeParse('').success).toBe(false);
  });
});

describe('UnixSecondsString', () => {
  it('accepts both a digit string and a non-negative integer number', () => {
    expect(UnixSecondsString.safeParse('1700000000').success).toBe(true);
    expect(UnixSecondsString.safeParse(1700000000).success).toBe(true);
  });
  it('rejects a negative number, a fractional number, and a non-numeric string', () => {
    expect(UnixSecondsString.safeParse(-1).success).toBe(false);
    expect(UnixSecondsString.safeParse(1.5).success).toBe(false);
    expect(UnixSecondsString.safeParse('abc').success).toBe(false);
  });
});

describe('DecimalsField wire compatibility', () => {
  it('parses extra.decimals = 9 from /supported (number)', () => {
    expect(DecimalsField.safeParse(9).success).toBe(true);
  });
  it('parses requirements.decimals = "9" from /verify (string)', () => {
    expect(DecimalsField.safeParse('9').success).toBe(true);
  });
  it('decimalsToNumber(9) === 9 and decimalsToNumber("9") === 9', () => {
    expect(decimalsToNumber(9)).toBe(9);
    expect(decimalsToNumber('9')).toBe(9);
  });
  it('rejects "9.5", -1, and "abc"', () => {
    expect(DecimalsField.safeParse('9.5').success).toBe(false);
    expect(DecimalsField.safeParse(-1).success).toBe(false);
    expect(DecimalsField.safeParse('abc').success).toBe(false);
  });
});

describe('X402Version', () => {
  it('accepts the literal 2', () => {
    expect(X402Version.safeParse(2).success).toBe(true);
  });
  it('rejects 1 and the string "2"', () => {
    expect(X402Version.safeParse(1).success).toBe(false);
    expect(X402Version.safeParse('2').success).toBe(false);
  });
});

describe('X402Scheme', () => {
  it('accepts the literal "exact"', () => {
    expect(X402Scheme.safeParse('exact').success).toBe(true);
  });
  it('rejects any other scheme', () => {
    expect(X402Scheme.safeParse('transfer').success).toBe(false);
  });
});
