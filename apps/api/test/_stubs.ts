import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
  type SignerGuardPolicy,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';
import type { IntentRouterDeps } from '../src/intents/router.js';

export interface StubDeps extends IntentRouterDeps {
  cleanup(): void;
}

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

export function makeStubDeps(): StubDeps {
  const handle = openSignerGuardDb();
  runAuditMigrations(handle.sqlite);
  const spendLedger = makeSpendLedger(handle.db);
  const guard = makeSignerGuard({ spendLedger, signer: stubSigner, clock: () => Date.now() });
  const audit = new AuditTraceStore(handle.sqlite);
  return { guard, policy: stubPolicy, audit, spendLedger, cleanup: () => handle.close() };
}
