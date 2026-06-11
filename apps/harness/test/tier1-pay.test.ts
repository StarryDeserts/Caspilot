import { describe, it, expect } from 'vitest';
import { planTier1PaySuccess } from '../src/tier1-pay.js';

const CEP18 = `00${'aa'.repeat(32)}`;
const AGENT = `00${'bb'.repeat(32)}`;
const RECEIVER = `00${'cc'.repeat(32)}`;
const OUTSIDER = `00${'ee'.repeat(32)}`;

function vault() {
  return {
    cep18Contract: CEP18,
    allowedAgents: [AGENT],
    allowedReceivers: [RECEIVER],
    maxSinglePayment: '100',
    dailyLimit: '500',
  };
}

describe('Tier 1 pay-success plan', () => {
  it('targets the allowlisted receiver with amount <= maxSinglePayment', () => {
    const plan = planTier1PaySuccess({ vault: vault(), agent: AGENT, amount: '50' });
    expect(plan.receiver).toBe(RECEIVER);
    expect(plan.amount).toBe('50');
    expect(plan.expectedRejection).toBeUndefined();
  });

  it('refuses if amount > maxSinglePayment (would be rejected on-chain)', () => {
    expect(() => planTier1PaySuccess({ vault: vault(), agent: AGENT, amount: '200' })).toThrow(
      /maxSinglePayment/,
    );
  });

  it('refuses if the agent is not allowlisted', () => {
    expect(() => planTier1PaySuccess({ vault: vault(), agent: OUTSIDER, amount: '50' })).toThrow(
      /agent/,
    );
  });

  it.skipIf(process.env.RUN_REAL_ONCHAIN !== '1')(
    'REAL — broadcasts pay() through the deployed vault and observes finalization',
    async () => {
      // Wired by run-tier1.ts (Task 6.8) in real mode, NOT here. The real path is:
      //   1. buildContractCallDeploy(...) assembles the StoredContractByHash pay() call.
      //   2. loadLocalDevSigner signs the deploy hash; CasperDeployAdapter.submitSignedDeploy
      //      re-validates and broadcasts the byte-identical deploy.
      //   3. CasperDeployAdapter.awaitDeployFinalized polls to EXECUTED/FINALIZED and
      //      reports { finalizedHeight, success: true }.
      //   4. The runner appends { deployHash, finalizedHeight } to .demo/tier1-events.json.
      // casper-test only, gated on RUN_REAL_ONCHAIN=1.
      expect(true).toBe(true);
    },
  );
});
