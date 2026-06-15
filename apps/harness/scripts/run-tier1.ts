import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLTypeKey, CLTypeUInt8, CLValue, KeyAlgorithm } from 'casper-js-sdk';
import { CasperDeployAdapter, CasperStateReader, makeRpcEntityClient } from '@caspilot/adapters';
import type { RawSigner } from '@caspilot/signer-guard';
import { type DeployVaultPlan, buildDeployVaultPlan } from './deploy-vault.js';
import { buildSeedPlan } from './seed-demo.js';
import { type PaySuccessPlan, planTier1PaySuccess } from '../src/tier1-pay.js';
import { type RejectionPlan, planTier1Rejection } from '../src/tier1-rejection.js';
import { loadLocalDevSigner } from '../src/local-dev-signer.js';
import {
  type Tier1Broadcaster,
  type Tier1LiveDeps,
  type Tier1Reader,
  buildLiveTier1Ops,
  makeLiveDeployBuilder,
} from '../src/live-tier1-ops.js';
import {
  type Tier1OrchestrationInput,
  type Tier1RejectionInput,
  orchestrateTier1,
} from '../src/orchestrate-tier1.js';

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

const DAY_MS = 86_400_000;
/** Default vault validity window when the operator does not pin DEMO_VAULT_VALID_UNTIL_MS. */
const DEFAULT_VAULT_WINDOW_MS = 7 * DAY_MS;
/** A WASM install is large; a contract call is cheap. Both overridable via env. */
const DEFAULT_INSTALL_MOTES = '500000000000';
const DEFAULT_CALL_MOTES = '5000000000';

/**
 * Everything a REAL Tier-1 run needs that the dry {@link RunTier1Plan} does not
 * carry. The orchestrator installs CEP-18 *fresh* — it never reuses
 * `CEP18_CONTRACT_HASH`, which is only a dry-plan/seed artifact — so the token's
 * WASM, its `init` metadata, the vault's validity window, and the per-deploy
 * payment all originate here, from env + WASM files, not from the projection.
 */
export interface Tier1RealConfig {
  rpc: string;
  chainName: string;
  signerKeyPath: string;
  signerAlgorithm: KeyAlgorithm;
  cep18WasmPath: string;
  vaultWasmPath: string;
  cep18: { name: string; symbol: string; decimals: number; totalSupply: string };
  vault: { maxSingle: string; dailyLimit: string; validUntilMs: number };
  paymentMotes: { install: string; call: string };
}

function needReal(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`${k} is required for a REAL run-tier1`);
  return v;
}

/** Map the operator's algorithm name to the SDK enum; secp256k1 is the funded default. */
function parseSignerAlgorithm(raw: string | undefined): KeyAlgorithm {
  const v = (raw ?? 'secp256k1').toLowerCase();
  if (v === 'secp256k1') return KeyAlgorithm.SECP256K1;
  if (v === 'ed25519') return KeyAlgorithm.ED25519;
  throw new Error(`unsupported CASPER_SIGNER_ALGORITHM "${raw}" (use secp256k1 or ed25519)`);
}

/**
 * Parse the REAL-mode env into a typed {@link Tier1RealConfig}. Pure (no I/O):
 * every field is validated here so a misconfigured run fails before the signer
 * is loaded or any deploy is built.
 */
export function buildTier1RealConfig(input: {
  env: Record<string, string | undefined>;
  now: () => number;
}): Tier1RealConfig {
  const e = input.env;

  const decimalsRaw = e.CEP18_DECIMALS ?? '9';
  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`CEP18_DECIMALS must be a u8 (0-255): ${decimalsRaw}`);
  }

  const validUntilRaw = e.DEMO_VAULT_VALID_UNTIL_MS;
  const validUntilMs =
    validUntilRaw !== undefined ? Number(validUntilRaw) : input.now() + DEFAULT_VAULT_WINDOW_MS;
  if (!Number.isInteger(validUntilMs) || validUntilMs <= 0) {
    throw new Error(`DEMO_VAULT_VALID_UNTIL_MS must be a positive integer (ms): ${validUntilRaw}`);
  }

  return {
    rpc: needReal(e, 'CASPER_NODE_RPC'),
    chainName: needReal(e, 'CASPER_CHAINSPEC'),
    signerKeyPath: needReal(e, 'LOCAL_SIGNER_PRIVATE_KEY_PATH'),
    signerAlgorithm: parseSignerAlgorithm(e.CASPER_SIGNER_ALGORITHM),
    cep18WasmPath: needReal(e, 'CEP18_WASM_PATH'),
    vaultWasmPath: needReal(e, 'VAULT_WASM_PATH'),
    cep18: {
      name: e.CEP18_NAME ?? 'CaspilotDemoUSD',
      symbol: e.CEP18_SYMBOL ?? 'CDUSD',
      decimals,
      totalSupply: e.CEP18_TOTAL_SUPPLY ?? '1000000000',
    },
    vault: {
      maxSingle: needReal(e, 'DEMO_MAX_SINGLE'),
      dailyLimit: needReal(e, 'DEMO_DAILY_LIMIT'),
      validUntilMs,
    },
    paymentMotes: {
      install: e.CASPER_INSTALL_PAYMENT_MOTES ?? DEFAULT_INSTALL_MOTES,
      call: e.CASPER_CALL_PAYMENT_MOTES ?? DEFAULT_CALL_MOTES,
    },
  };
}

/**
 * Assemble the {@link Tier1LiveDeps} the orchestrator drives from a parsed
 * {@link Tier1RealConfig} plus the already-constructed live handles. The signer,
 * broadcaster, and reader are injected so this wiring — which builder is used,
 * the CEP-18 `init` args, the WASM each install carries — stays offline-assertable;
 * `main` supplies the real network-backed handles. CEP-18 wasm is read before the
 * vault wasm, mirroring the install order the orchestrator runs them in.
 */
export function assembleTier1LiveDeps(input: {
  config: Tier1RealConfig;
  signer: RawSigner;
  broadcaster: Tier1Broadcaster;
  reader: Tier1Reader;
  readWasm: (path: string) => Uint8Array;
}): Tier1LiveDeps {
  const { config, signer, broadcaster, reader, readWasm } = input;
  const build = makeLiveDeployBuilder({
    chainName: config.chainName,
    senderPk: signer.signerPk,
    paymentMotes: config.paymentMotes,
  });
  return {
    signer,
    broadcaster,
    reader,
    build,
    cep18: {
      wasm: readWasm(config.cep18WasmPath),
      // The full 7-arg odra-modules 2.0.0 `Cep18::init` ABI, in declaration order:
      //   init(symbol, name, decimals, initial_supply, admin_list, minter_list, modality)
      // init mints `initial_supply` to the caller and grants the caller Admin
      // unconditionally, so empty admin/minter lists are correct. `modality` is
      // Option::None (`00` tag) to stay independent of the Cep18Modality byte-width.
      installArgs: {
        symbol: CLValue.newCLString(config.cep18.symbol),
        name: CLValue.newCLString(config.cep18.name),
        decimals: CLValue.newCLUint8(config.cep18.decimals),
        initial_supply: CLValue.newCLUInt256(config.cep18.totalSupply),
        admin_list: CLValue.newCLList(CLTypeKey, []),
        minter_list: CLValue.newCLList(CLTypeKey, []),
        modality: CLValue.newCLOption(null, CLTypeUInt8),
      },
    },
    vault: {
      wasm: readWasm(config.vaultWasmPath),
      maxSingle: config.vault.maxSingle,
      dailyLimit: config.vault.dailyLimit,
      validUntilMs: config.vault.validUntilMs,
    },
  };
}

async function main(): Promise<void> {
  const plan = buildRunTier1Plan({ env: process.env });
  console.log(`[run-tier1] mode=${plan.mode} steps=${plan.steps.length}`);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.mode === 'dry') return;

  // REAL (RUN_REAL_ONCHAIN=1): dispatch every step through @caspilot/adapters,
  // each signed by the local_dev signer (the private key only ever produces a
  // detached signature — the adapter never holds it), and seal the finalized
  // outcomes into .demo/tier1-events.json for the artifact dumper. casper-test
  // only, never mainnet.
  const config = buildTier1RealConfig({ env: process.env, now: () => Date.now() });
  const signer = loadLocalDevSigner({
    pemPath: config.signerKeyPath,
    algorithm: config.signerAlgorithm,
  });
  const broadcaster = new CasperDeployAdapter({ url: config.rpc });
  const reader = new CasperStateReader(makeRpcEntityClient({ url: config.rpc }));
  const deps = assembleTier1LiveDeps({
    config,
    signer,
    broadcaster,
    reader,
    readWasm: (p) => readFileSync(p),
  });

  const events = await orchestrateTier1(tier1InputFromPlan(plan), buildLiveTier1Ops(deps));

  const out = resolve(process.cwd(), '.demo');
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/tier1-events.json`, JSON.stringify(events, null, 2));
  console.log(`[run-tier1] REAL run complete; wrote ${out}/tier1-events.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
