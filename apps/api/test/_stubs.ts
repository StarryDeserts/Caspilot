import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
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

export function makeStubDeps(): StubDeps {
  const handle = openSignerGuardDb();
  runAuditMigrations(handle.sqlite);
  const spendLedger = makeSpendLedger(handle.db);
  const guard = makeSignerGuard({ spendLedger, signer: stubSigner, clock: () => Date.now() });
  const audit = new AuditTraceStore(handle.sqlite);
  return { guard, audit, cleanup: () => handle.close() };
}
