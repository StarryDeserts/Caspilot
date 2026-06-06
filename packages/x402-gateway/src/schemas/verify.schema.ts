import { z } from 'zod';
import { X402ErrorReasonSchema } from './errors.schema.js';
import { PaymentPayloadSchema } from './payment-payload.schema.js';
import { PaymentRequirementsSchema } from './payment-requirements.schema.js';
import { CasperAccountAddressHex } from './primitives.schema.js';

export const VerifyRequestSchema = z
  .object({
    paymentPayload: PaymentPayloadSchema,
    paymentRequirements: PaymentRequirementsSchema,
  })
  .strict();
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

/** Wire shape (facilitator may include payer on success). */
export const WireVerifyResponseSchema = z.discriminatedUnion('isValid', [
  z.object({ isValid: z.literal(true), payer: CasperAccountAddressHex.optional() }).strict(),
  z.object({ isValid: z.literal(false), invalidReason: X402ErrorReasonSchema }).strict(),
]);
export type WireVerifyResponse = z.infer<typeof WireVerifyResponseSchema>;

/** Normalized shape returned to gateway callers — payer always present on
 *  success because we cross-fill from PaymentPayload.payload.authorization.from
 *  when the wire response omits it. */
export const NormalizedVerifyResponseSchema = z.discriminatedUnion('isValid', [
  z.object({ isValid: z.literal(true), payer: CasperAccountAddressHex }).strict(),
  z.object({ isValid: z.literal(false), invalidReason: X402ErrorReasonSchema }).strict(),
]);
export type NormalizedVerifyResponse = z.infer<typeof NormalizedVerifyResponseSchema>;
