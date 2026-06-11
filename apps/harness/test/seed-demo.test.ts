import { describe, it, expect } from 'vitest';
import { SignerGuardPolicySchema } from '@caspilot/signer-guard';
import { buildSeedPlan } from '../scripts/seed-demo.js';

const CEP18 = 'a'.repeat(64);
const AGENT = `00${'bb'.repeat(32)}`;
const RECEIVER = `00${'cc'.repeat(32)}`;
const BLOCKED = `00${'dd'.repeat(32)}`;

function env(): Record<string, string> {
  return {
    CEP18_CONTRACT_HASH: CEP18,
    DEMO_AGENT_HASH: AGENT,
    DEMO_RECEIVER_HASH: RECEIVER,
    DEMO_BLOCKED_RECEIVER_HASH: BLOCKED,
    DEMO_MAX_SINGLE: '100',
    DEMO_DAILY_LIMIT: '500',
  };
}

describe('seed-demo plan', () => {
  it('configures the vault to allow only the demo agent + receiver (never the blocked receiver)', () => {
    const plan = buildSeedPlan({ env: env() });
    expect(plan.vault.allowedAgents).toEqual([AGENT]);
    expect(plan.vault.allowedReceivers).toEqual([RECEIVER]);
    expect(plan.vault.allowedReceivers).not.toContain(BLOCKED);
  });

  it('produces a SignerGuard policy scoped to the demo receiver + token', () => {
    const plan = buildSeedPlan({ env: env() });
    expect(plan.signerGuard.signerRole).toBe('local_dev');
    expect(plan.signerGuard.receiverPolicy).toBe('allowlist');
    expect(plan.signerGuard.allowedReceivers).toEqual([RECEIVER]);
    expect(plan.signerGuard.allowedReceivers).not.toContain(BLOCKED);
    expect(plan.signerGuard.allowedContractPackages).toContain(CEP18);
    expect(plan.signerGuard.allowedTokens).toContain(CEP18);
    expect(plan.signerGuard.allowedChainIds).toContain('casper:casper-test');
  });

  it('emits a policy that loads under the real SignerGuard schema (deny-empty enforced)', () => {
    const plan = buildSeedPlan({ env: env() });
    expect(() => SignerGuardPolicySchema.parse(plan.signerGuard)).not.toThrow();
  });

  it('refuses to build if any env var is missing', () => {
    expect(() => buildSeedPlan({ env: {} })).toThrow(/CEP18_CONTRACT_HASH/);
  });
});
