import { type DeployVaultPlan, buildDeployVaultPlan } from './deploy-vault.js';
import { buildSeedPlan } from './seed-demo.js';
import { type PaySuccessPlan, planTier1PaySuccess } from '../src/tier1-pay.js';
import { type RejectionPlan, planTier1Rejection } from '../src/tier1-rejection.js';
import type { Tier1OrchestrationInput, Tier1RejectionInput } from '../src/orchestrate-tier1.js';

export type RunTier1StepName =
  | 'deploy-vault'
  | 'pay-success'
  | 'rejection-receiver-not-allowed'
  | 'rejection-over-max-single-payment';

export interface RunTier1Step {
  name: RunTier1StepName;
  payload: DeployVaultPlan | PaySuccessPlan | RejectionPlan;
}

export interface RunTier1Plan {
  mode: 'dry' | 'real';
  rpc: string;
  chainspec: string;
  steps: RunTier1Step[];
}

/**
 * Composes the full Tier-1 sequence (deploy → accepted pay → two rejections)
 * from the same builders the individual scripts use, so the dry plan is an
 * exact preview of what the real run would broadcast. Each sub-plan re-applies
 * the vault's guards, so an impossible demo config fails here, before any deploy.
 */
export function buildRunTier1Plan(input: {
  env: Record<string, string | undefined>;
}): RunTier1Plan {
  const e = input.env;
  const deploy = buildDeployVaultPlan({ env: e, now: () => Date.now() });
  const seed = buildSeedPlan({ env: e });

  const agent = seed.vault.allowedAgents[0];
  if (!agent) throw new Error('seed produced no allowlisted agent');
  // buildSeedPlan already requires DEMO_BLOCKED_RECEIVER_HASH; re-read it here for
  // the rejection step and narrow the type for the strict-optional call below.
  const blockedReceiver = e.DEMO_BLOCKED_RECEIVER_HASH;
  if (!blockedReceiver) throw new Error('DEMO_BLOCKED_RECEIVER_HASH is required');
  const payAmount = e.DEMO_PAY_AMOUNT ?? '50';
  const rejectionAmount = e.DEMO_REJECTION_AMOUNT ?? '999';

  const paySuccess = planTier1PaySuccess({ vault: seed.vault, agent, amount: payAmount });
  const rejReceiver = planTier1Rejection({
    vault: seed.vault,
    agent,
    kind: 'receiver_not_allowed',
    blockedReceiver,
    amount: payAmount,
  });
  const rejBudget = planTier1Rejection({
    vault: seed.vault,
    agent,
    kind: 'over_max_single_payment',
    amount: rejectionAmount,
  });

  return {
    mode: deploy.mode,
    rpc: deploy.rpc,
    chainspec: deploy.expectedChainspec,
    steps: [
      { name: 'deploy-vault', payload: deploy },
      { name: 'pay-success', payload: paySuccess },
      { name: 'rejection-receiver-not-allowed', payload: rejReceiver },
      { name: 'rejection-over-max-single-payment', payload: rejBudget },
    ],
  };
}

/**
 * Projects a {@link RunTier1Plan} into the {@link Tier1OrchestrationInput} the
 * orchestrator consumes. The plan already pre-flighted every guard; this only
 * picks out the receiver/amount/expected-code facts the on-chain sequence needs.
 *
 * Funding equals the accepted amount: only the accepted pay reaches the vault's
 * balance check, so the two rejections (which revert earlier) need no funding.
 */
export function tier1InputFromPlan(plan: RunTier1Plan): Tier1OrchestrationInput {
  const payStep = plan.steps.find((s) => s.name === 'pay-success');
  if (!payStep) throw new Error('plan is missing the pay-success step');
  // Step name is the authoritative discriminator set by buildRunTier1Plan.
  const pay = payStep.payload as PaySuccessPlan;

  const rejections: Tier1RejectionInput[] = plan.steps
    .filter(
      (s) =>
        s.name === 'rejection-receiver-not-allowed' ||
        s.name === 'rejection-over-max-single-payment',
    )
    .map((s) => {
      const r = s.payload as RejectionPlan;
      return {
        kind: r.kind,
        receiver: r.receiver,
        amount: r.amount,
        expectedErrorCode: r.expectedErrorCode,
      };
    });

  return {
    paySuccess: { receiver: pay.receiver, amount: pay.amount },
    rejections,
    fundAmount: pay.amount,
  };
}

async function main(): Promise<void> {
  const plan = buildRunTier1Plan({ env: process.env });
  console.log(`[run-tier1] mode=${plan.mode} steps=${plan.steps.length}`);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.mode === 'real') {
    // Same gap as deploy-vault.ts: the read+write adapter surface exists, but
    // dispatching these steps for real needs (1) the ModuleBytes session-WASM
    // builder for the vault deploy and (2) buildContractCallDeploy →
    // loadLocalDevSigner → CasperDeployAdapter.submitSignedDeploy → awaitDeployFinalized
    // wiring for pay/reject, appending each result to .demo/tier1-events.json.
    // We refuse loudly rather than fake a broadcast; casper-test only when it lands.
    throw new Error(
      'REAL run-tier1 is not wired: dispatch each step through @caspilot/adapters and write ' +
        '.demo/tier1-events.json. Run without RUN_REAL_ONCHAIN=1 for the dry plan.',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
