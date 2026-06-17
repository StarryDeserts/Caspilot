import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type SignerGuardDbHandle,
  computePolicyDigest,
  dayUtcFromMs,
  makeSpendLedger,
  openSignerGuardDb,
  type SpendLedger,
} from '@caspilot/signer-guard';
import { DEFAULT_DEMO_POLICY } from '../src/deps.js';
import { SIGNER_PK_PLACEHOLDER } from '../src/intents/router.js';
import { projectVault, projectVaultDetail, vaultId } from '../src/vaults/projection.js';

// Pin a wall clock for the dayUtc the vault reports, kept distinct from the
// ledger clock below (which drives createdAt → recentDebits ordering).
const NOW_MS = Date.parse('2026-06-17T12:00:00Z');
const DAY = dayUtcFromMs(NOW_MS);

const policy = DEFAULT_DEMO_POLICY;
const token = policy.allowedTokens[0];
if (!token) throw new Error('DEFAULT_DEMO_POLICY must allow at least one token');

describe('vault projection (projectVault / projectVaultDetail)', () => {
  let handle: SignerGuardDbHandle;
  let ledger: SpendLedger;
  let clockNow = 1000;

  // The intent router reserves under (policy.signerRole, SIGNER_PK_PLACEHOLDER,
  // body.token). Seed the ledger under the same key so usage matches what the
  // live router would have written.
  const reservation = (amount: string, intentId: string) => ({
    signerRole: policy.signerRole,
    signerPk: SIGNER_PK_PLACEHOLDER,
    token,
    dayUtc: DAY,
    amount,
    intentId,
    traceId: `trace-${intentId}`,
  });

  beforeEach(async () => {
    handle = openSignerGuardDb();
    clockNow = 1000;
    ledger = makeSpendLedger(handle.db, () => clockNow);
    // committed 100 @1000, reserved 50 @2000, released 30 @3000 (released excluded)
    const a = await ledger.reserve(reservation('100', 'a'), policy.perDayCapAtomic);
    if (a.ok) await ledger.commit(a.reservationId);
    clockNow = 2000;
    await ledger.reserve(reservation('50', 'b'), policy.perDayCapAtomic);
    clockNow = 3000;
    const c = await ledger.reserve(reservation('30', 'c'), policy.perDayCapAtomic);
    if (c.ok) await ledger.release(c.reservationId);
  });

  afterEach(() => {
    handle.close();
  });

  describe('vaultId', () => {
    it('is "vault_" + the policy digest prefix (deterministic for a policy)', () => {
      expect(vaultId(policy)).toBe(`vault_${computePolicyDigest(policy).slice(0, 16)}`);
    });
  });

  describe('projectVault', () => {
    it('projects only real policy fields, with today usage summed reserved+committed', () => {
      const summary = projectVault(policy, ledger, NOW_MS);
      expect(summary).toEqual({
        id: vaultId(policy),
        signerRole: policy.signerRole,
        token,
        contract: policy.allowedContractPackages[0],
        receiverPolicy: policy.receiverPolicy,
        allowedReceivers: policy.allowedReceivers,
        maxSinglePaymentAtomic: policy.maxSinglePaymentAtomic,
        perDayCapAtomic: policy.perDayCapAtomic,
        usedTodayAtomic: '150',
        dayUtc: DAY,
        policyDigest: computePolicyDigest(policy),
      });
    });

    it('reports zero usage on a day with no debits', () => {
      const summary = projectVault(policy, ledger, Date.parse('2026-06-20T00:00:00Z'));
      expect(summary.usedTodayAtomic).toBe('0');
      expect(summary.dayUtc).toBe('2026-06-20');
    });
  });

  describe('projectVaultDetail', () => {
    it('extends the summary with chain/trace policy and recent debits newest-first', () => {
      const detail = projectVaultDetail(policy, ledger, NOW_MS);
      expect(detail.id).toBe(vaultId(policy));
      expect(detail.usedTodayAtomic).toBe('150');
      expect(detail.allowedChainIds).toEqual(policy.allowedChainIds);
      expect(detail.requireTraceId).toBe(policy.requireTraceId);
      // released row 'c' is not a debit; reserved+committed only, newest-first.
      expect(detail.recentDebits).toEqual([
        { amount: '50', status: 'reserved', intentId: 'b', traceId: 'trace-b', atMs: 2000 },
        { amount: '100', status: 'committed', intentId: 'a', traceId: 'trace-a', atMs: 1000 },
      ]);
    });
  });
});
