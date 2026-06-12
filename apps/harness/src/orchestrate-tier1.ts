/**
 * Pure Tier-1 orchestration: given an injected set of on-chain effects
 * ({@link Tier1ChainOps}), run the install → recover → allow → fund → pay
 * sequence, validate each accept/reject outcome against expectations, and
 * assemble a {@link Tier1Events} record the artifact dumper can seal.
 *
 * Every wire effect is injected so this layer is fully offline-testable: it
 * owns the *logic* (step order, recovered-hash threading, accept/reject
 * validation, event shape) while the live broadcast lives in the ops shell
 * wired by `scripts/run-tier1.ts`.
 *
 * The recovered hashes thread forward exactly as Odra requires: the CEP-18 and
 * PolicyVault *package* hashes drive every versioned entry-point call, while the
 * vault *contract* (entity) hash is what funding and the sealed artifact need.
 */

/** Discriminants the PolicyVault contract reverts with, keyed by rejection kind. */
export type RejectionKind =
  | 'receiver_not_allowed'
  | 'over_max_single_payment'
  | 'over_daily_limit'
  | 'expired'
  | 'duplicate_nonce';

/** Result of one finalized deploy: its hash, block height, and revert state. */
export interface StepOutcome {
  deployHash: string;
  finalizedHeight: number;
  success: boolean;
  /** Odra user-error discriminant when `success` is false. */
  errorCode?: number;
}

/** One rejection the demo provokes on purpose, with the code it must revert with. */
export interface Tier1RejectionInput {
  kind: RejectionKind;
  receiver: string;
  amount: string;
  expectedErrorCode: number;
}

export interface Tier1OrchestrationInput {
  /** The single payment that must be accepted on chain. */
  paySuccess: { receiver: string; amount: string };
  /** Payments that must each revert with their declared error code. */
  rejections: Tier1RejectionInput[];
  /** CEP-18 amount funded into the vault before the accepted pay. */
  fundAmount: string;
}

/**
 * The on-chain effects, injected. The live implementation signs + broadcasts +
 * awaits finalization; tests pass a recording fake. `recover*` reads the
 * deployer's named keys to resolve Odra's stored package/contract hashes.
 */
export interface Tier1ChainOps {
  installCep18(): Promise<StepOutcome>;
  recoverPackageHash(name: 'Cep18' | 'PolicyVault'): Promise<string>;
  installVault(input: { cep18PackageHash: string }): Promise<StepOutcome>;
  recoverVaultContractHash(vaultPackageHash: string): Promise<string>;
  allowAgent(input: { vaultPackageHash: string }): Promise<StepOutcome>;
  allowReceiver(input: { vaultPackageHash: string; receiver: string }): Promise<StepOutcome>;
  fundVault(input: {
    cep18PackageHash: string;
    vaultContractHash: string;
    amount: string;
  }): Promise<StepOutcome>;
  pay(input: { vaultPackageHash: string; receiver: string; amount: string }): Promise<StepOutcome>;
}

/** The assembled, schema-shaped record the artifact dumper consumes. */
export interface Tier1Events {
  vault: { contractHash: string; deployHash: string; finalizedHeight: number };
  paySuccess: { deployHash: string; amount: string; receiver: string; finalizedHeight: number };
  rejections: Array<{
    kind: RejectionKind;
    deployHash: string;
    errorCode: number;
    finalizedHeight: number;
  }>;
}

/** A setup deploy that reverts is fatal — the demo cannot proceed on bad state. */
function assertSetupSuccess(step: string, outcome: StepOutcome): void {
  if (!outcome.success) {
    throw new Error(`setup step ${step} reverted on chain (code ${outcome.errorCode})`);
  }
}

export async function orchestrateTier1(
  input: Tier1OrchestrationInput,
  ops: Tier1ChainOps,
): Promise<Tier1Events> {
  // 1. Install CEP-18, then recover its package hash from the deployer's keys.
  assertSetupSuccess('install_cep18', await ops.installCep18());
  const cep18PackageHash = await ops.recoverPackageHash('Cep18');

  // 2. Install the vault wired to that CEP-18, then recover its package + entity hashes.
  const vaultInstall = await ops.installVault({ cep18PackageHash });
  assertSetupSuccess('install_vault', vaultInstall);
  const vaultPackageHash = await ops.recoverPackageHash('PolicyVault');
  const vaultContractHash = await ops.recoverVaultContractHash(vaultPackageHash);

  // 3. Allow the agent (the deploy signer) and the accepted receiver; fund the vault.
  //    Agent is checked first on every pay, so it must be allowed before any pay —
  //    otherwise the intended receiver_not_allowed / over_max rejections would
  //    surface as AgentNotAllowed instead.
  const { receiver, amount } = input.paySuccess;
  assertSetupSuccess('allow_agent', await ops.allowAgent({ vaultPackageHash }));
  assertSetupSuccess('allow_receiver', await ops.allowReceiver({ vaultPackageHash, receiver }));
  assertSetupSuccess(
    'fund_vault',
    await ops.fundVault({ cep18PackageHash, vaultContractHash, amount: input.fundAmount }),
  );

  // 4. The accepted payment must land; a revert here means a broken demo, never
  //    a recorded paySuccess.
  const payOut = await ops.pay({ vaultPackageHash, receiver, amount });
  if (!payOut.success) {
    throw new Error(`accepted pay reverted on chain (code ${payOut.errorCode})`);
  }

  // 5. Each provoked rejection must revert on chain with its declared code.
  const rejections: Tier1Events['rejections'] = [];
  for (const r of input.rejections) {
    const out = await ops.pay({ vaultPackageHash, receiver: r.receiver, amount: r.amount });
    if (out.success) {
      throw new Error(`rejection ${r.kind} was unexpectedly accepted on chain`);
    }
    if (out.errorCode !== r.expectedErrorCode) {
      throw new Error(
        `rejection ${r.kind} reverted with code ${out.errorCode} but expected ${r.expectedErrorCode}`,
      );
    }
    rejections.push({
      kind: r.kind,
      deployHash: out.deployHash,
      errorCode: out.errorCode,
      finalizedHeight: out.finalizedHeight,
    });
  }

  return {
    vault: {
      contractHash: vaultContractHash,
      deployHash: vaultInstall.deployHash,
      finalizedHeight: vaultInstall.finalizedHeight,
    },
    paySuccess: {
      deployHash: payOut.deployHash,
      amount,
      receiver,
      finalizedHeight: payOut.finalizedHeight,
    },
    rejections,
  };
}
