import { z } from 'zod';
import {
  AtomicDecimalString,
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  Cep18PackageHashHex,
  DecimalsField,
  X402Scheme,
} from './primitives.schema.js';

export const PaymentRequirementsSchema = z
  .object({
    scheme: X402Scheme,
    network: CasperCaip2ChainId,
    payTo: CasperAccountAddressHex,
    amount: AtomicDecimalString,
    asset: Cep18PackageHashHex,
    extra: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        decimals: DecimalsField,
      })
      .strict(),
    maxTimeoutSeconds: z.number().int().positive(),
  })
  .strict();
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;
