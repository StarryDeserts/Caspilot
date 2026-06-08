import { describe, expect, it } from 'vitest';
import { canonicalSha256Hex } from '@caspilot/shared';
import { computePolicyDigest } from '@caspilot/signer-guard';
import type { SignerGuardPolicy } from '@caspilot/signer-guard';

const PACKAGE_A = 'a'.repeat(64);
const TOKEN_A = 'b'.repeat(64);
const RECEIVER_A = `00${'c'.repeat(64)}`;
const RECEIVER_B = `00${'d'.repeat(64)}`;

const policy: SignerGuardPolicy = {
  signerRole: 'local_dev',
  allowedChainIds: ['casper:casper-test', 'casper:casper-dev'],
  allowedContractPackages: [PACKAGE_A],
  allowedTokens: [TOKEN_A],
  receiverPolicy: 'allowlist',
  allowedReceivers: [RECEIVER_A, RECEIVER_B],
  maxSinglePaymentAtomic: '100',
  perDayCapAtomic: '1000',
  requireTraceId: true,
};

describe('computePolicyDigest', () => {
  it('returns the shared canonical SHA-256 hex digest for the policy', () => {
    expect(computePolicyDigest(policy)).toBe(canonicalSha256Hex(policy));
  });

  it('ignores object key order', () => {
    const reorderedPolicy: SignerGuardPolicy = {
      requireTraceId: policy.requireTraceId,
      perDayCapAtomic: policy.perDayCapAtomic,
      maxSinglePaymentAtomic: policy.maxSinglePaymentAtomic,
      allowedReceivers: policy.allowedReceivers,
      receiverPolicy: policy.receiverPolicy,
      allowedTokens: policy.allowedTokens,
      allowedContractPackages: policy.allowedContractPackages,
      allowedChainIds: policy.allowedChainIds,
      signerRole: policy.signerRole,
    };

    expect(computePolicyDigest(reorderedPolicy)).toBe(computePolicyDigest(policy));
  });

  it('preserves array order', () => {
    const reorderedReceivers: SignerGuardPolicy = {
      ...policy,
      allowedReceivers: [...policy.allowedReceivers].reverse(),
    };

    expect(computePolicyDigest(reorderedReceivers)).not.toBe(computePolicyDigest(policy));
  });

  it('changes when receiverPolicy changes', () => {
    const manualApprovalPolicy: SignerGuardPolicy = {
      ...policy,
      receiverPolicy: 'allow_any_with_manual_approval',
    };

    expect(computePolicyDigest(manualApprovalPolicy)).not.toBe(computePolicyDigest(policy));
  });
});
