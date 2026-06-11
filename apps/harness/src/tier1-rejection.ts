import type { SeedPlan } from '../scripts/seed-demo.js';

export type RejectionKind =
  | 'receiver_not_allowed'
  | 'over_max_single_payment'
  | 'over_daily_limit'
  | 'expired'
  | 'duplicate_nonce';

// On-chain error codes are the PolicyVaultError discriminants from
// contracts/policy-vault/src/errors.rs. The revert surfaces the raw discriminant:
//   self.revert(PolicyVaultError::ReceiverNotAllowed)   // discriminant = 3
//     -> OdraError::code() == 3        (odra-core 2.0.0: ExecutionError::User(3).code() => 3)
//     -> runtime::revert(ApiError::User(3))
//     -> execution_result.error_message == "User error: 3"
//     -> CasperDeployAdapter.awaitDeployFinalized records errorCode 3.
// The plan's 60004+ values came from an aspirational error enum that was never
// built; recording them would make the artifact disagree with the chain.
const ERROR_CODE: Record<RejectionKind, number> = {
  receiver_not_allowed: 3,
  over_max_single_payment: 4,
  over_daily_limit: 5,
  expired: 6,
  duplicate_nonce: 7,
};

export interface RejectionPlan {
  cep18Contract: string;
  agent: string;
  receiver: string;
  amount: string;
  kind: RejectionKind;
  expectedErrorCode: number;
}

/**
 * Pre-flights a Tier-1 pay() that the on-chain PolicyVault should REJECT, and
 * records which contract error the chain is expected to surface.
 *
 * Tier 1 wires the two rejections a clean vault can produce on a first call:
 *   A. receiver_not_allowed  — target a receiver that is NOT on the allowlist.
 *   B. over_max_single_payment — send an amount above maxSinglePayment.
 * The other kinds (daily-limit, expired, duplicate-nonce) need prior on-chain
 * state, so they are reserved for later tiers and refused here rather than faked.
 */
export function planTier1Rejection(input: {
  vault: SeedPlan['vault'];
  agent: string;
  kind: RejectionKind;
  amount: string;
  blockedReceiver?: string;
}): RejectionPlan {
  const { vault, agent, kind, amount, blockedReceiver } = input;
  if (kind === 'receiver_not_allowed') {
    if (!blockedReceiver) {
      throw new Error('pathway A (receiver_not_allowed) requires blockedReceiver');
    }
    if (vault.allowedReceivers.includes(blockedReceiver)) {
      throw new Error('blockedReceiver is on the allowlist — choose a non-allowlisted address');
    }
    return {
      cep18Contract: vault.cep18Contract,
      agent,
      receiver: blockedReceiver,
      amount,
      kind,
      expectedErrorCode: ERROR_CODE[kind],
    };
  }
  if (kind === 'over_max_single_payment') {
    if (BigInt(amount) <= BigInt(vault.maxSinglePayment)) {
      throw new Error(
        `amount ${amount} must exceed maxSinglePayment ${vault.maxSinglePayment} to trigger rejection`,
      );
    }
    const receiver = vault.allowedReceivers[0];
    if (!receiver) throw new Error('no allowlisted receivers configured');
    return {
      cep18Contract: vault.cep18Contract,
      agent,
      receiver,
      amount,
      kind,
      expectedErrorCode: ERROR_CODE[kind],
    };
  }
  throw new Error(`rejection kind ${kind} is not wired in Tier 1`);
}
