import { z } from 'zod';

const Hex32 = z.string().regex(/^[0-9a-f]{64}$/);
const AccountHashHex = z.string().regex(/^00[0-9a-f]{64}$/);

export const VaultArtifact = z.object({
  contractHash: AccountHashHex,
  deployHash: Hex32,
  finalizedHeight: z.number().int().nonnegative(),
});

export const PaySuccessArtifact = z.object({
  deployHash: Hex32,
  amount: z.string().regex(/^\d+$/),
  receiver: AccountHashHex,
  finalizedHeight: z.number().int().nonnegative(),
});

export const RejectionArtifact = z.object({
  kind: z.enum(['receiver_not_allowed', 'over_max_single_payment', 'over_daily_limit', 'expired', 'duplicate_nonce']),
  deployHash: Hex32,
  errorCode: z.number().int(),
  finalizedHeight: z.number().int().nonnegative(),
});

export const TierOneArtifactsSchema = z.object({
  generatedAtMs: z.number().int().nonnegative(),
  network: z.string().min(1),
  chainspec: z.string().min(1),
  vault: VaultArtifact,
  paySuccess: PaySuccessArtifact,
  rejections: z.array(RejectionArtifact).min(1, 'tier 1 requires at least one real rejection'),
  notes: z.string().optional(),
});

export type TierOneArtifacts = z.infer<typeof TierOneArtifactsSchema>;
export type RejectionKind = z.infer<typeof RejectionArtifact>['kind'];
