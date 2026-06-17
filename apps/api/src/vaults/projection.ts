import {
  computePolicyDigest,
  dayUtcFromMs,
  type SignerGuardPolicy,
  type SignerRole,
  type ReceiverPolicy,
  type SpendLedger,
} from '@caspilot/signer-guard';
import { SIGNER_PK_PLACEHOLDER } from '../intents/router.js';

// A vault is a READ-ONLY projection of the one live SignerGuardPolicy plus
// today's real SpendLedger usage — honest provenance, no fabricated state. Only
// fields that actually exist on the policy are surfaced (no invented expiry).
export interface VaultSummary {
  id: string;
  signerRole: SignerRole;
  token: string;
  contract: string;
  receiverPolicy: ReceiverPolicy;
  allowedReceivers: string[];
  maxSinglePaymentAtomic: string;
  perDayCapAtomic: string;
  usedTodayAtomic: string;
  dayUtc: string;
  policyDigest: string;
}

export interface RecentDebit {
  amount: string;
  status: 'reserved' | 'committed';
  intentId: string;
  traceId: string;
  atMs: number;
}

export interface VaultDetail extends VaultSummary {
  allowedChainIds: string[];
  requireTraceId: boolean;
  recentDebits: RecentDebit[];
}

const RECENT_DEBITS_LIMIT = 20;

export function vaultId(policy: SignerGuardPolicy): string {
  return `vault_${computePolicyDigest(policy).slice(0, 16)}`;
}

export function projectVault(
  policy: SignerGuardPolicy,
  ledger: SpendLedger,
  nowMs: number,
): VaultSummary {
  const dayUtc = dayUtcFromMs(nowMs);
  // The demo policy allows exactly one token; usage is keyed per token (matching
  // the per-(role,pk,token,day) cap the ledger enforces). An empty allowlist is
  // degenerate — it authorizes nothing, so usage is honestly zero.
  const token = policy.allowedTokens[0] ?? '';
  const usedTodayAtomic = ledger.usedOnDay({
    signerRole: policy.signerRole,
    signerPk: SIGNER_PK_PLACEHOLDER,
    token,
    dayUtc,
  });
  return {
    id: vaultId(policy),
    signerRole: policy.signerRole,
    token,
    contract: policy.allowedContractPackages[0] ?? '',
    receiverPolicy: policy.receiverPolicy,
    allowedReceivers: policy.allowedReceivers,
    maxSinglePaymentAtomic: policy.maxSinglePaymentAtomic,
    perDayCapAtomic: policy.perDayCapAtomic,
    usedTodayAtomic,
    dayUtc,
    policyDigest: computePolicyDigest(policy),
  };
}

export function projectVaultDetail(
  policy: SignerGuardPolicy,
  ledger: SpendLedger,
  nowMs: number,
): VaultDetail {
  const summary = projectVault(policy, ledger, nowMs);
  const recentDebits: RecentDebit[] = ledger
    .listForSigner({
      signerRole: policy.signerRole,
      signerPk: SIGNER_PK_PLACEHOLDER,
      token: summary.token,
      limit: RECENT_DEBITS_LIMIT,
    })
    .map((row) => ({
      amount: row.amount,
      // listForSigner already excludes 'released' in SQL — these are debits only.
      status: row.status as 'reserved' | 'committed',
      intentId: row.intentId,
      traceId: row.traceId,
      atMs: row.createdAt,
    }));
  return {
    ...summary,
    allowedChainIds: policy.allowedChainIds,
    requireTraceId: policy.requireTraceId,
    recentDebits,
  };
}
