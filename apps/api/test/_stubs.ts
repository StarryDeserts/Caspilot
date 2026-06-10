import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';
import type { IntentRouterDeps } from '../src/intents/router.js';

const stubSigner: RawSigner = {
  signerRole: 'local_dev',
  signerPk: `01${'ab'.repeat(32)}`,
  async sign() {
    return { signatureHex: 'ab'.repeat(65) };
  },
};

export function makeStubDeps(): IntentRouterDeps {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-api-'));
  const handle = openSignerGuardDb(join(dir, 'l.sqlite'));
  runAuditMigrations(handle.sqlite);
  const spendLedger = makeSpendLedger(handle.db);
  const guard = makeSignerGuard({ spendLedger, signer: stubSigner, clock: () => Date.now() });
  const audit = new AuditTraceStore(handle.sqlite);
  return { guard, audit };
}
