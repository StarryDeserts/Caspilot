import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
  type SignerGuardPolicy,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';
import type { IntentRouterDeps } from './intents/router.js';

export interface ApiDepsConfig {
  /** SQLite path; defaults to in-memory. Point at a mounted volume in production. */
  dbPath?: string;
  policy?: SignerGuardPolicy;
  now?: () => number;
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
  // Omit `now` entirely when unset — under exactOptionalPropertyTypes the
  // optional `now?` cannot be explicitly assigned `undefined`.
  return {
    guard,
    policy,
    audit,
    spendLedger,
    ...(config.now ? { now: config.now } : {}),
    cleanup: () => handle.close(),
  };
}
