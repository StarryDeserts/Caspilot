import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type SignerGuardPolicyConfig, SignerGuardPolicySchema } from '@caspilot/signer-guard';

export interface SeedPlan {
  vault: {
    cep18Contract: string;
    allowedAgents: string[];
    allowedReceivers: string[];
    maxSinglePayment: string;
    dailyLimit: string;
  };
  signerGuard: SignerGuardPolicyConfig;
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
}

export function buildSeedPlan(input: { env: Record<string, string | undefined> }): SeedPlan {
  const e = input.env;
  const cep18 = need(e, 'CEP18_CONTRACT_HASH');
  const agent = need(e, 'DEMO_AGENT_HASH');
  const receiver = need(e, 'DEMO_RECEIVER_HASH');
  need(e, 'DEMO_BLOCKED_RECEIVER_HASH'); // ensures the operator declared the rejection counterparty up front
  const maxSingle = need(e, 'DEMO_MAX_SINGLE');
  const dailyLimit = need(e, 'DEMO_DAILY_LIMIT');

  // Parse through the real SignerGuard schema so the emitted policy is
  // guaranteed loadable and deny-empty is enforced at seed time (the Phase 6
  // contract). For the single-token demo the CEP-18 package is both the only
  // allowed contract package and the only allowed token.
  const signerGuard = SignerGuardPolicySchema.parse({
    signerRole: 'local_dev',
    allowedChainIds: ['casper:casper-test'],
    allowedContractPackages: [cep18],
    allowedTokens: [cep18],
    receiverPolicy: 'allowlist',
    allowedReceivers: [receiver],
    maxSinglePaymentAtomic: maxSingle,
    perDayCapAtomic: dailyLimit,
    requireTraceId: true,
  });

  return {
    vault: {
      cep18Contract: cep18,
      allowedAgents: [agent],
      allowedReceivers: [receiver],
      maxSinglePayment: maxSingle,
      dailyLimit,
    },
    signerGuard,
  };
}

async function main(): Promise<void> {
  const plan = buildSeedPlan({ env: process.env });
  const out = resolve(process.cwd(), '.demo');
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/seed-plan.json`, JSON.stringify(plan, null, 2));
  writeFileSync(`${out}/signer-guard.json`, JSON.stringify(plan.signerGuard, null, 2));
  console.log(`[seed-demo] wrote ${out}/seed-plan.json and ${out}/signer-guard.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
