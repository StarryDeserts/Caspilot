import { computePolicyDigest } from './digest.js';
import { checkPolicyRules } from './rules.js';
import { dayUtcFromMs, type SpendLedger } from './spend-ledger.js';
import type { RawSigner, SignRequest, SignResult } from './types.js';

export interface SignerGuard {
  authorize(req: SignRequest): Promise<SignResult>;
}

export interface SignerGuardDeps {
  spendLedger: SpendLedger;
  signer: RawSigner;
  clock: () => number;
}

export function makeSignerGuard(deps: SignerGuardDeps): SignerGuard {
  return {
    async authorize(req): Promise<SignResult> {
      const policyDigest = computePolicyDigest(req.policy);
      if (
        req.policy.signerRole !== req.signerRole ||
        req.signerRole !== deps.signer.signerRole ||
        req.signerPk !== deps.signer.signerPk
      ) {
        return { ok: false, reason: 'signer_role_mismatch', policyDigest };
      }

      const denial = checkPolicyRules(req);
      if (denial) return { ok: false, reason: denial, policyDigest };

      const reserved = await deps.spendLedger.reserve(
        {
          signerRole: req.signerRole,
          signerPk: req.signerPk,
          token: req.intendedToken,
          dayUtc: dayUtcFromMs(deps.clock()),
          amount: req.intendedAmountAtomic,
          intentId: req.intentId,
          traceId: req.traceId,
        },
        req.policy.perDayCapAtomic,
      );
      if (!reserved.ok) return { ok: false, reason: reserved.reason, policyDigest };

      try {
        const signed = await deps.signer.sign(req.unsignedDeploy);
        return {
          ok: true,
          signatureHex: signed.signatureHex,
          reservationId: reserved.reservationId,
          policyDigest,
        };
      } catch {
        await deps.spendLedger.release(reserved.reservationId);
        return { ok: false, reason: 'signer_failed', policyDigest };
      }
    },
  };
}
