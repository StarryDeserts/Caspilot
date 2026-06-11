import type { SeedPlan } from '../scripts/seed-demo.js';

export interface PaySuccessPlan {
  cep18Contract: string;
  agent: string;
  receiver: string;
  amount: string;
  /** Discriminator: a pay-success plan is, by construction, never a rejection. */
  expectedRejection?: never;
}

/**
 * Pre-flights a Tier-1 pay() that the on-chain PolicyVault should ACCEPT.
 *
 * The vault's own guards are reproduced here so the harness refuses to broadcast
 * a call the contract would revert — the agent must be allowlisted and the
 * amount must be within maxSinglePayment. The vault contract address is not
 * known at plan time (it comes from the deploy step); the only contract this
 * plan can truthfully name is the CEP-18 token being moved.
 */
export function planTier1PaySuccess(input: {
  vault: SeedPlan['vault'];
  agent: string;
  amount: string;
}): PaySuccessPlan {
  const { vault, agent, amount } = input;
  if (!vault.allowedAgents.includes(agent)) throw new Error(`agent ${agent} is not allowlisted`);
  if (BigInt(amount) > BigInt(vault.maxSinglePayment)) {
    throw new Error(`amount ${amount} exceeds maxSinglePayment ${vault.maxSinglePayment}`);
  }
  const receiver = vault.allowedReceivers[0];
  if (!receiver) throw new Error('no allowlisted receivers configured');
  return { cep18Contract: vault.cep18Contract, agent, receiver, amount };
}
