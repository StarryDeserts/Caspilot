import { describe, expect, it } from 'vitest';
import { SIGNER_ROLES, SignerGuardPolicySchema } from '@caspilot/signer-guard';

const PACKAGE_A = 'a'.repeat(64);
const TOKEN_A = 'b'.repeat(64);
const RECEIVER_A = `00${'c'.repeat(64)}`;

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    signerRole: 'local_dev',
    allowedChainIds: ['casper:casper-test'],
    allowedContractPackages: [PACKAGE_A],
    allowedTokens: [TOKEN_A],
    receiverPolicy: 'allowlist',
    allowedReceivers: [RECEIVER_A],
    maxSinglePaymentAtomic: '100',
    perDayCapAtomic: '1000',
    requireTraceId: true,
    ...overrides,
  };
}

describe('SignerGuardPolicySchema', () => {
  it('parses a canonical policy with the approved signer-guard fields', () => {
    const policy = makePolicy();

    expect(SignerGuardPolicySchema.parse(policy)).toEqual(policy);
  });

  it('allows only approved signer roles', () => {
    for (const signerRole of SIGNER_ROLES) {
      expect(SignerGuardPolicySchema.parse(makePolicy({ signerRole })).signerRole).toBe(signerRole);
    }

    expect(
      SignerGuardPolicySchema.safeParse(makePolicy({ signerRole: 'hot_wallet' })).success,
    ).toBe(false);
  });

  it('requires non-empty chain, contract package, and token allowlists', () => {
    for (const field of ['allowedChainIds', 'allowedContractPackages', 'allowedTokens'] as const) {
      const result = SignerGuardPolicySchema.safeParse(makePolicy({ [field]: [] }));

      expect(result.success).toBe(false);
    }
  });

  it('allows empty receivers only when receiverPolicy is deny_all', () => {
    expect(
      SignerGuardPolicySchema.safeParse(
        makePolicy({ receiverPolicy: 'deny_all', allowedReceivers: [] }),
      ).success,
    ).toBe(true);

    for (const receiverPolicy of ['allowlist', 'allow_any_with_manual_approval'] as const) {
      const result = SignerGuardPolicySchema.safeParse(
        makePolicy({ receiverPolicy, allowedReceivers: [] }),
      );

      expect(result.success).toBe(false);
    }
  });

  it('requires atomic decimal strings for payment caps', () => {
    expect(
      SignerGuardPolicySchema.safeParse(makePolicy({ maxSinglePaymentAtomic: '1.0' })).success,
    ).toBe(false);
    expect(SignerGuardPolicySchema.safeParse(makePolicy({ perDayCapAtomic: '-1' })).success).toBe(
      false,
    );
  });

  it('rejects max single payment caps above the per-day cap using BigInt scale', () => {
    const result = SignerGuardPolicySchema.safeParse(
      makePolicy({
        maxSinglePaymentAtomic: '9007199254740993',
        perDayCapAtomic: '9007199254740992',
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join('.') === 'maxSinglePaymentAtomic'),
      ).toBe(true);
    }
  });

  it('rejects unknown policy keys', () => {
    expect(SignerGuardPolicySchema.safeParse(makePolicy({ unexpected: true })).success).toBe(false);
  });
});
