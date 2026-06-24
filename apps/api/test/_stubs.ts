import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
  type SignerGuardPolicy,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';
import type { DeployReader, IntentRouterDeps } from '../src/intents/router.js';

export interface StubDeps extends IntentRouterDeps {
  cleanup(): void;
}

// Default on-chain verifier: reports a finalized, successful execution. Tests
// that exercise revert/not-found inject their own reader via makeStubDeps opts.
const successDeployReader: DeployReader = {
  async awaitDeployFinalized() {
    return { finalizedHeight: 100, success: true };
  },
};

const stubSigner: RawSigner = {
  signerRole: 'local_dev',
  signerPk: `01${'ab'.repeat(32)}`,
  async sign() {
    return { signatureHex: 'ab'.repeat(65) };
  },
};

const stubPolicy: SignerGuardPolicy = {
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

export function makeStubDeps(
  policyOverride: Partial<SignerGuardPolicy> = {},
  opts: { deployReader?: DeployReader } = {},
): StubDeps {
  const handle = openSignerGuardDb();
  runAuditMigrations(handle.sqlite);
  const spendLedger = makeSpendLedger(handle.db);
  const guard = makeSignerGuard({ spendLedger, signer: stubSigner, clock: () => Date.now() });
  const audit = new AuditTraceStore(handle.sqlite);
  const policy: SignerGuardPolicy = { ...stubPolicy, ...policyOverride };
  return {
    guard,
    policy,
    audit,
    spendLedger,
    // Live-mode config so the on-chain co-sign endpoints mount in tests.
    unsignedDeploy: { chainName: 'casper-test', paymentMotes: '3000000000' },
    deployReader: opts.deployReader ?? successDeployReader,
    cleanup: () => handle.close(),
  };
}
