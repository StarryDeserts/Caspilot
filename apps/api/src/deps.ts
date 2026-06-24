import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
  type SignerGuardPolicy,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';
import type { DeployReader, IntentRouterDeps } from './intents/router.js';

export interface ApiDepsConfig {
  /** SQLite path; defaults to in-memory. Point at a mounted volume in production. */
  dbPath?: string;
  policy?: SignerGuardPolicy;
  now?: () => number;
  // Live-only on-chain wiring. Supplied solely by the real server entry
  // (index.ts), which owns the RPC URL and constructs a CasperDeployAdapter.
  // Their presence is what mounts the CSPR.click co-sign endpoints
  // (/build-unsigned-deploy + /confirm-onchain); pure-demo mode (serve-demo,
  // tests) omits them and keeps the mark-executed fast-forward instead.
  deployReader?: DeployReader;
  unsignedDeploy?: { chainName: string; paymentMotes: string };
}

export interface ApiDeps extends IntentRouterDeps {
  cleanup(): void;
}

// The API drives the intent lifecycle (policy + spend ledger + audit) but never
// broadcasts on-chain — real signing lives in apps/harness, where only a detached
// signature crosses into the deploy adapter. So this placeholder throws rather
// than emit a signature: the demo routes never call it, and a future caller that
// tries to sign from the API should fail loudly instead of leaking authority.
const nonBroadcastingSigner: RawSigner = {
  signerRole: 'local_dev',
  signerPk: `01${'ab'.repeat(32)}`,
  async sign() {
    throw new Error('apps/api does not broadcast — signing belongs to the harness');
  },
};

// Demo-safe defaults that allow the canonical Tier-1 demo intent. A real
// deployment should load policy from config/env, not hardcode allowlist values.
export const DEFAULT_DEMO_POLICY: SignerGuardPolicy = {
  signerRole: 'local_dev',
  allowedChainIds: ['casper:casper-test'],
  allowedContractPackages: [`00${'cc'.repeat(32)}`],
  allowedTokens: ['cspr-test-cep18'],
  receiverPolicy: 'allowlist',
  allowedReceivers: [`00${'bb'.repeat(32)}`],
  maxSinglePaymentAtomic: '500',
  perDayCapAtomic: '100000',
  requireTraceId: false,
};

// The native-CSPR path carries no contract package (the value moved IS native
// CSPR). This human-readable sentinel fills the intent's `contract` field and the
// policy allowlist so the two stay in sync; the router branches on token 'CSPR',
// and the adapter ignores it entirely (a native `transfer` has no package).
export const NATIVE_SENTINEL_PACKAGE = 'native-cspr-transfer';

// Shape guard for a Casper public key (the live native receiver the operator
// allowlists): 01 + ED25519 (32 bytes) or 02 + SECP256K1 (33 bytes).
const CASPER_PK_RE = /^(?:01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;

// Live native-CSPR demo policy for the CSPR.click browser co-sign path. Kept
// SEPARATE from DEFAULT_DEMO_POLICY because the amount cap is unit-blind: it
// cannot tightly bound both CEP-18 token base units and native motes at once.
// Here every cap is MOTES-denominated (≥ the casper-test 2.5 CSPR minimum), and
// the receiver is a single PublicKey the operator supplies — so the allowlist is
// a real, scoped constraint, not a rubber stamp. `maxSinglePaymentMotes` /
// `perDayMotes` default to 5 / 50 CSPR but can be tightened by the caller.
export function nativeDemoPolicy(
  receiverPk: string,
  opts: { maxSinglePaymentMotes?: string; perDayMotes?: string } = {},
): SignerGuardPolicy {
  if (!CASPER_PK_RE.test(receiverPk)) {
    throw new Error(
      `nativeDemoPolicy: receiver must be a Casper public key (01/02 + hex), got ${receiverPk}`,
    );
  }
  return {
    signerRole: 'local_dev',
    allowedChainIds: ['casper:casper-test'],
    allowedContractPackages: [NATIVE_SENTINEL_PACKAGE],
    allowedTokens: ['CSPR'],
    receiverPolicy: 'allowlist',
    allowedReceivers: [receiverPk],
    maxSinglePaymentAtomic: opts.maxSinglePaymentMotes ?? '5000000000',
    perDayCapAtomic: opts.perDayMotes ?? '50000000000',
    requireTraceId: false,
  };
}

export function buildApiDeps(config: ApiDepsConfig = {}): ApiDeps {
  const handle = openSignerGuardDb(config.dbPath ?? ':memory:');
  runAuditMigrations(handle.sqlite);
  const spendLedger = makeSpendLedger(handle.db);
  const guard = makeSignerGuard({
    spendLedger,
    signer: nonBroadcastingSigner,
    clock: config.now ?? (() => Date.now()),
  });
  const audit = new AuditTraceStore(handle.sqlite);
  const policy = config.policy ?? DEFAULT_DEMO_POLICY;
  // Omit optional fields entirely when unset — under exactOptionalPropertyTypes
  // an optional `prop?` cannot be explicitly assigned `undefined`. The on-chain
  // deps are spread in only when live wiring supplies them, so omitting them
  // here keeps the co-sign endpoints unmounted in pure-demo mode.
  return {
    guard,
    policy,
    audit,
    spendLedger,
    ...(config.now ? { now: config.now } : {}),
    ...(config.deployReader ? { deployReader: config.deployReader } : {}),
    ...(config.unsignedDeploy ? { unsignedDeploy: config.unsignedDeploy } : {}),
    cleanup: () => handle.close(),
  };
}
