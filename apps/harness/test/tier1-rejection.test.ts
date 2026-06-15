import { describe, it, expect } from 'vitest';
import { planTier1Rejection } from '../src/tier1-rejection.js';

const CEP18 = `00${'aa'.repeat(32)}`;
const AGENT = `00${'bb'.repeat(32)}`;
const RECEIVER = `00${'cc'.repeat(32)}`;
const BLOCKED = `00${'dd'.repeat(32)}`;

function baseVault() {
  return {
    cep18Contract: CEP18,
    allowedAgents: [AGENT],
    allowedReceivers: [RECEIVER],
    maxSinglePayment: '100',
    dailyLimit: '500',
  };
}

describe('Tier 1 rejection plans', () => {
  it('pathway A — receiver_not_allowed expects PolicyVaultError::ReceiverNotAllowed (3)', () => {
    const plan = planTier1Rejection({
      vault: baseVault(),
      agent: AGENT,
      kind: 'receiver_not_allowed',
      blockedReceiver: BLOCKED,
      amount: '50',
    });
    expect(plan.kind).toBe('receiver_not_allowed');
    expect(plan.expectedErrorCode).toBe(3);
    expect(plan.receiver).toBe(BLOCKED);
  });

  it('pathway B — over_max_single_payment expects PolicyVaultError::AmountAboveMax (4)', () => {
    const plan = planTier1Rejection({
      vault: baseVault(),
      agent: AGENT,
      kind: 'over_max_single_payment',
      amount: '999',
    });
    expect(plan.expectedErrorCode).toBe(4);
    expect(plan.amount).toBe('999');
  });

  it('refuses to construct pathway A without a blocked receiver', () => {
    expect(() =>
      planTier1Rejection({
        vault: baseVault(),
        agent: AGENT,
        kind: 'receiver_not_allowed',
        amount: '50',
      }),
    ).toThrow(/blockedReceiver/);
  });

  it('refuses pathway A when the "blocked" receiver is actually allowlisted', () => {
    expect(() =>
      planTier1Rejection({
        vault: baseVault(),
        agent: AGENT,
        kind: 'receiver_not_allowed',
        blockedReceiver: RECEIVER,
        amount: '50',
      }),
    ).toThrow(/allowlist/);
  });

  it('refuses to construct pathway B with amount <= maxSinglePayment', () => {
    expect(() =>
      planTier1Rejection({
        vault: baseVault(),
        agent: AGENT,
        kind: 'over_max_single_payment',
        amount: '50',
      }),
    ).toThrow(/amount/);
  });
});
