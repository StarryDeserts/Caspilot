import { z } from 'zod';
import { X402ErrorReasonSchema } from './errors.schema.js';
import { CasperAccountAddressHex, CasperCaip2ChainId, Hex64 } from './primitives.schema.js';
import { VerifyRequestSchema } from './verify.schema.js';

export const SettleRequestSchema = VerifyRequestSchema;
export type SettleRequest = z.infer<typeof SettleRequestSchema>;

/** Wire shape (matches facilitator HTTP response): transaction is a bare
 *  deploy-hash string, alongside network and payer. */
export const WireSettleResponseSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      network: CasperCaip2ChainId,
      transaction: Hex64,
      payer: CasperAccountAddressHex,
    })
    .strict(),
  z.object({ success: z.literal(false), errorReason: X402ErrorReasonSchema }).strict(),
]);
export type WireSettleResponse = z.infer<typeof WireSettleResponseSchema>;

/** Normalized shape used internally and returned by the gateway. */
export const NormalizedSettleResponseSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      transaction: z.object({ chainId: CasperCaip2ChainId, deployHash: Hex64 }).strict(),
      payer: CasperAccountAddressHex,
    })
    .strict(),
  z.object({ success: z.literal(false), errorReason: X402ErrorReasonSchema }).strict(),
]);
export type NormalizedSettleResponse = z.infer<typeof NormalizedSettleResponseSchema>;
