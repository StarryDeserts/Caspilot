import { describe, expect, it } from 'vitest';
import { checkPolicyRules } from '@caspilot/signer-guard';
import type { SignRequest } from '@caspilot/signer-guard';

type SignRequestOverrides = Omit<Partial<SignRequest>, 'policy' | 'unsignedDeploy'> & {
  policy?: Partial<SignRequest['policy']>;
  unsignedDeploy?: Partial<SignRequest['unsignedDeploy']>;
};

const PACKAGE_A = 'a'.repeat(64);
const PACKAGE_B = 'b'.repeat(64);
const TOKEN_A = 'c'.repeat(64);
const TOKEN_B = 'd'.repeat(64);
const RECEIVER_A = `00${'e'.repeat(64)}`;
const RECEIVER_B = `00${'f'.repeat(64)}`;

const baseRequest: SignRequest = {
  policy: {
    signerRole: 'local_dev',
    allowedChainIds: ['casper:casper-test'],
    allowedContractPackages: [PACKAGE_A],
    allowedTokens: [TOKEN_A],
    receiverPolicy: 'allowlist',
    allowedReceivers: [RECEIVER_A],
    maxSinglePaymentAtomic: '100',
    perDayCapAtomic: '1000',
    requireTraceId: true,
  },
  intentId: 'intent-1',
  traceId: 'trace-1',
  signerRole: 'local_dev',
  signerPk: `01${'1'.repeat(64)}`,
  unsignedDeploy: {
    headerJson: { account: `01${'1'.repeat(64)}` },
    bodyHashHex: '2'.repeat(64),
    payloadHex: 'deadbeef',
  },
  intendedContractPackage: PACKAGE_A,
  intendedReceiver: RECEIVER_A,
  intendedToken: TOKEN_A,
  intendedAmountAtomic: '50',
  intendedChainId: 'casper:casper-test',
};

function makeRequest(overrides: SignRequestOverrides = {}): SignRequest {
  const { policy, unsignedDeploy, ...requestOverrides } = overrides;

  return {
    ...baseRequest,
    ...requestOverrides,
    policy: {
      ...baseRequest.policy,
      ...policy,
    },
    unsignedDeploy: {
      ...baseRequest.unsignedDeploy,
      ...unsignedDeploy,
    },
  };
}

describe('checkPolicyRules', () => {
  it('returns null when request matches every policy rule', () => {
    expect(checkPolicyRules(makeRequest())).toBeNull();
  });

  it('returns trace_id_missing when trace id is required but empty', () => {
    expect(checkPolicyRules(makeRequest({ traceId: '' }))).toBe('trace_id_missing');
  });

  it('permits an empty trace id when trace id is not required', () => {
    expect(
      checkPolicyRules(makeRequest({ traceId: '', policy: { requireTraceId: false } })),
    ).toBeNull();
  });

  it('returns chain_not_allowed when the intended chain is not allowlisted', () => {
    expect(checkPolicyRules(makeRequest({ intendedChainId: 'casper:casper-main' }))).toBe(
      'chain_not_allowed',
    );
  });

  it('returns package_not_allowed when the intended contract package is not allowlisted', () => {
    expect(checkPolicyRules(makeRequest({ intendedContractPackage: PACKAGE_B }))).toBe(
      'package_not_allowed',
    );
  });

  it('returns token_not_allowed when the intended token is not allowlisted', () => {
    expect(checkPolicyRules(makeRequest({ intendedToken: TOKEN_B }))).toBe('token_not_allowed');
  });

  it('treats empty chain allowlists as deny-all by includes behavior', () => {
    expect(checkPolicyRules(makeRequest({ policy: { allowedChainIds: [] } }))).toBe(
      'chain_not_allowed',
    );
  });

  it('treats empty contract package allowlists as deny-all by includes behavior', () => {
    expect(checkPolicyRules(makeRequest({ policy: { allowedContractPackages: [] } }))).toBe(
      'package_not_allowed',
    );
  });

  it('treats empty token allowlists as deny-all by includes behavior', () => {
    expect(checkPolicyRules(makeRequest({ policy: { allowedTokens: [] } }))).toBe(
      'token_not_allowed',
    );
  });

  it('always denies receivers when receiver policy is deny_all', () => {
    expect(checkPolicyRules(makeRequest({ policy: { receiverPolicy: 'deny_all' } }))).toBe(
      'receiver_not_allowed',
    );
  });

  it('permits only allowlisted receivers when receiver policy is allowlist', () => {
    expect(checkPolicyRules(makeRequest({ intendedReceiver: RECEIVER_A }))).toBeNull();
    expect(checkPolicyRules(makeRequest({ intendedReceiver: RECEIVER_B }))).toBe(
      'receiver_not_allowed',
    );
  });

  it('treats empty receiver allowlists as deny-all by includes behavior', () => {
    expect(checkPolicyRules(makeRequest({ policy: { allowedReceivers: [] } }))).toBe(
      'receiver_not_allowed',
    );
  });

  it('denies allow_any_with_manual_approval until approval proof exists in a later phase', () => {
    expect(
      checkPolicyRules(
        makeRequest({ policy: { receiverPolicy: 'allow_any_with_manual_approval' } }),
      ),
    ).toBe('receiver_not_allowed');
  });

  it('returns amount_above_single_cap only when the intended amount exceeds the single-payment cap', () => {
    expect(checkPolicyRules(makeRequest({ intendedAmountAtomic: '100' }))).toBeNull();
    expect(checkPolicyRules(makeRequest({ intendedAmountAtomic: '101' }))).toBe(
      'amount_above_single_cap',
    );
  });

  it('does not enforce signer role mismatch in the pure policy rules', () => {
    expect(checkPolicyRules(makeRequest({ signerRole: 'demo_sponsored' }))).toBeNull();
  });

  it('returns amount_malformed when the intended amount is not a plain digit string', () => {
    for (const bad of ['', '  ', '-5', '1.5', '0x10', '5x']) {
      expect(checkPolicyRules(makeRequest({ intendedAmountAtomic: bad }))).toBe('amount_malformed');
    }
  });

  it('returns amount_malformed when the single-payment cap is not a plain digit string', () => {
    for (const bad of ['', '10x', '1.0']) {
      expect(checkPolicyRules(makeRequest({ policy: { maxSinglePaymentAtomic: bad } }))).toBe(
        'amount_malformed',
      );
    }
  });
});
