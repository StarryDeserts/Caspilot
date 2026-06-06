import { z } from 'zod';
import {
  AtomicDecimalString,
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  CasperPublicKeyHex,
  CasperSignatureHex,
  Hex64,
  UnixSecondsString,
  X402Scheme,
  X402Version,
} from './primitives.schema.js';

export const AuthorizationSchema = z
  .object({
    from: CasperAccountAddressHex,
    to: CasperAccountAddressHex,
    value: AtomicDecimalString,
    validAfter: UnixSecondsString,
    validBefore: UnixSecondsString,
    nonce: Hex64,
  })
  .strict();
export type Authorization = z.infer<typeof AuthorizationSchema>;

export const PaymentPayloadSchema = z
  .object({
    x402Version: X402Version,
    scheme: X402Scheme,
    network: CasperCaip2ChainId,
    payload: z
      .object({
        signature: CasperSignatureHex,
        publicKey: CasperPublicKeyHex,
        authorization: AuthorizationSchema,
      })
      .strict(),
  })
  .strict();
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;
