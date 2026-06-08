import { z } from 'zod';
import {
  AtomicDecimalString,
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  Cep18PackageHashHex,
} from '@caspilot/x402';
import { SIGNER_ROLES } from './types.js';

export const ReceiverPolicySchema = z.enum(['deny_all', 'allowlist', 'allow_any_with_manual_approval']);

export const SignerGuardPolicySchema = z
  .object({
    signerRole: z.enum(SIGNER_ROLES),
    allowedChainIds: z.array(CasperCaip2ChainId).nonempty(),
    allowedContractPackages: z.array(Cep18PackageHashHex).nonempty(),
    allowedTokens: z.array(Cep18PackageHashHex).nonempty(),
    receiverPolicy: ReceiverPolicySchema,
    allowedReceivers: z.array(CasperAccountAddressHex),
    maxSinglePaymentAtomic: AtomicDecimalString,
    perDayCapAtomic: AtomicDecimalString,
    requireTraceId: z.boolean(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (policy.receiverPolicy !== 'deny_all' && policy.allowedReceivers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedReceivers'],
        message: 'allowedReceivers must contain at least one receiver unless receiverPolicy is deny_all',
      });
    }

    const capsAreAtomicDecimals =
      /^\d+$/.test(policy.maxSinglePaymentAtomic) && /^\d+$/.test(policy.perDayCapAtomic);
    if (
      capsAreAtomicDecimals &&
      BigInt(policy.maxSinglePaymentAtomic) > BigInt(policy.perDayCapAtomic)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSinglePaymentAtomic'],
        message: 'maxSinglePaymentAtomic must be less than or equal to perDayCapAtomic',
      });
    }
  });

export type SignerGuardPolicyConfig = z.infer<typeof SignerGuardPolicySchema>;
