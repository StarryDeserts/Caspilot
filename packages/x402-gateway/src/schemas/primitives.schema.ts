import { z } from 'zod';

export const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
export type Hex64 = z.infer<typeof Hex64>;

/** MVP / x402 wire form: "00" + 64 hex. */
export const CasperAccountAddressHex = z.string().regex(/^00[0-9a-f]{64}$/);
export type CasperAccountAddressHex = z.infer<typeof CasperAccountAddressHex>;

/** Algo-prefixed PublicKey. */
export const CasperPublicKeyHex = z.string().regex(/^(01[0-9a-f]{64}|02[0-9a-f]{66})$/);
export type CasperPublicKeyHex = z.infer<typeof CasperPublicKeyHex>;

/** Exactly 130 hex chars; no prefix enforcement until Go fixture pins it. */
export const CasperSignatureHex = z.string().regex(/^[0-9a-f]{130}$/);
export type CasperSignatureHex = z.infer<typeof CasperSignatureHex>;

export const Cep18PackageHashHex = Hex64;
export type Cep18PackageHashHex = z.infer<typeof Cep18PackageHashHex>;

export const CasperCaip2ChainId = z.string().regex(/^casper:[A-Za-z0-9_-]+$/);
export type CasperCaip2ChainId = z.infer<typeof CasperCaip2ChainId>;

export const AtomicDecimalString = z.string().regex(/^\d+$/);
export type AtomicDecimalString = z.infer<typeof AtomicDecimalString>;

export const UnixSecondsString = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative(),
]);
export type UnixSecondsString = z.infer<typeof UnixSecondsString>;

/** Accepts both:
 *    /supported extra.decimals  → number  (9)
 *    /verify  requirements.decimals → string  ("9")
 *  Normalize internally via decimalsToNumber(). */
export const DecimalsField = z.union([z.number().int().min(0).max(38), z.string().regex(/^\d+$/)]);
export type DecimalsWire = z.infer<typeof DecimalsField>;
export function decimalsToNumber(d: DecimalsWire): number {
  return typeof d === 'number' ? d : parseInt(d, 10);
}

export const X402Version = z.literal(2);
export type X402Version = z.infer<typeof X402Version>;

export const X402Scheme = z.literal('exact');
export type X402Scheme = z.infer<typeof X402Scheme>;
