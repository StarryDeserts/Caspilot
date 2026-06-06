import { z } from 'zod';
import {
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  DecimalsField,
  X402Scheme,
  X402Version,
} from './primitives.schema.js';

export const SupportedKindSchema = z
  .object({
    x402Version: X402Version,
    scheme: X402Scheme,
    network: CasperCaip2ChainId,
    extra: z
      .object({
        feePayer: CasperAccountAddressHex,
        decimals: DecimalsField,
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type SupportedKind = z.infer<typeof SupportedKindSchema>;

export const SupportedResponseSchema = z.object({ kinds: z.array(SupportedKindSchema) }).strict();
export type SupportedResponse = z.infer<typeof SupportedResponseSchema>;
