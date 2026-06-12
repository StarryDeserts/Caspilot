import { describe, it, expect } from 'vitest';
import { buildRunTier1Plan, tier1InputFromPlan } from '../scripts/run-tier1.js';

function baseEnv(): Record<string, string> {
  return {
    CASPER_NODE_RPC: 'http://node:7777/rpc',
    CASPER_CHAINSPEC: 'casper-test',
    LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k.pem',
    CEP18_CONTRACT_HASH: 'a'.repeat(64),
    DEMO_AGENT_HASH: `00${'bb'.repeat(32)}`,
    DEMO_RECEIVER_HASH: `00${'cc'.repeat(32)}`,
    DEMO_BLOCKED_RECEIVER_HASH: `00${'dd'.repeat(32)}`,
    DEMO_MAX_SINGLE: '100',
    DEMO_DAILY_LIMIT: '500',
    DEMO_PAY_AMOUNT: '50',
    DEMO_REJECTION_AMOUNT: '999',
  };
}

describe('run-tier1 (dry)', () => {
  it('plans 1 deploy + 1 pay-success + 2 rejections in order', () => {
    const plan = buildRunTier1Plan({ env: baseEnv() });
    expect(plan.steps.map((s) => s.name)).toEqual([
      'deploy-vault',
      'pay-success',
      'rejection-receiver-not-allowed',
      'rejection-over-max-single-payment',
    ]);
    expect(plan.mode).toBe('dry');
    expect(plan.rpc).toBe('http://node:7777/rpc');
    expect(plan.chainspec).toBe('casper-test');
  });

  it('marks mode=real when RUN_REAL_ONCHAIN=1', () => {
    const plan = buildRunTier1Plan({
      env: { ...baseEnv(), VAULT_WASM_PATH: '/tmp/vault.wasm', RUN_REAL_ONCHAIN: '1' },
    });
    expect(plan.mode).toBe('real');
  });
});

describe('tier1InputFromPlan', () => {
  const RECEIVER = `00${'cc'.repeat(32)}`;
  const BLOCKED = `00${'dd'.repeat(32)}`;

  it('projects the plan steps into the orchestration input', () => {
    const plan = buildRunTier1Plan({ env: baseEnv() });
    const input = tier1InputFromPlan(plan);

    expect(input.paySuccess).toEqual({ receiver: RECEIVER, amount: '50' });
    expect(input.rejections).toEqual([
      { kind: 'receiver_not_allowed', receiver: BLOCKED, amount: '50', expectedErrorCode: 3 },
      { kind: 'over_max_single_payment', receiver: RECEIVER, amount: '999', expectedErrorCode: 4 },
    ]);
    // The accepted pay is the only call that needs balance, so funding it with
    // the accepted amount is sufficient (the rejections revert before the
    // balance check).
    expect(input.fundAmount).toBe('50');
  });

  it('throws if the pay-success step is missing', () => {
    const plan = buildRunTier1Plan({ env: baseEnv() });
    const broken = { ...plan, steps: plan.steps.filter((s) => s.name !== 'pay-success') };
    expect(() => tier1InputFromPlan(broken)).toThrow(/pay-success/);
  });
});
