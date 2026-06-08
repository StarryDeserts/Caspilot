import type { SignDenial, SignRequest } from './types.js';

type RuleDenial = Exclude<
  SignDenial,
  'day_cap_exceeded' | 'reservation_conflict' | 'signer_failed' | 'signer_role_mismatch'
>;

export function checkPolicyRules(req: SignRequest): RuleDenial | null {
  if (req.policy.requireTraceId && req.traceId.length === 0) return 'trace_id_missing';
  if (!req.policy.allowedChainIds.includes(req.intendedChainId)) return 'chain_not_allowed';
  if (!req.policy.allowedContractPackages.includes(req.intendedContractPackage)) {
    return 'package_not_allowed';
  }
  if (!req.policy.allowedTokens.includes(req.intendedToken)) return 'token_not_allowed';
  if (receiverDenied(req)) return 'receiver_not_allowed';
  if (BigInt(req.intendedAmountAtomic) > BigInt(req.policy.maxSinglePaymentAtomic)) {
    return 'amount_above_single_cap';
  }
  return null;
}

function receiverDenied(req: SignRequest): boolean {
  if (req.policy.receiverPolicy === 'deny_all') return true;
  if (req.policy.receiverPolicy === 'allow_any_with_manual_approval') return true;
  return !req.policy.allowedReceivers.includes(req.intendedReceiver);
}
