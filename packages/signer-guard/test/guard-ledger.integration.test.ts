import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';
import { makeSignerGuard } from '../src/guard.js';
import { makeSpendLedger } from '../src/spend-ledger.js';
import type { RawSigner, SignRequest } from '../src/types.js';

const RECEIVER = `00${'a'.repeat(64)}`;
const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const CONTRACT = '2'.repeat(64);
const BODY_HASH = '3'.repeat(64);
const SIGNATURE = '4'.repeat(130);

type SignRequestOverrides = Omit<Partial<SignRequest>, 'policy'> & {
  policy?: Partial<SignRequest['policy']>;
};
function request(overrides: SignRequestOverrides = {}): SignRequest {
  const base: SignRequest = {
    policy: {
      signerRole: 'local_dev',
      allowedChainIds: ['casper:casper-test'],
      allowedContractPackages: [CONTRACT],
      allowedTokens: [TOKEN],
      receiverPolicy: 'allowlist',
      allowedReceivers: [RECEIVER],
      maxSinglePaymentAtomic: '500',
      perDayCapAtomic: '500',
      requireTraceId: true,
    },
    intentId: 'intent-1',
    traceId: 'trace-1',
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    unsignedDeploy: {
      headerJson: { account: SIGNER_PK },
      bodyHashHex: BODY_HASH,
      payloadHex: 'abcd',
    },
    intendedContractPackage: CONTRACT,
    intendedReceiver: RECEIVER,
    intendedToken: TOKEN,
    intendedAmountAtomic: '500',
    intendedChainId: 'casper:casper-test',
  };
  return { ...base, ...overrides, policy: { ...base.policy, ...overrides.policy } };
}

describe('SignerGuard with SQLite SpendLedger', () => {
  let handle: SignerGuardDbHandle;
  let signer: RawSigner;

  beforeEach(() => {
    handle = openSignerGuardDb();
    signer = {
      signerRole: 'local_dev',
      signerPk: SIGNER_PK,
      sign: vi.fn(async () => ({ signatureHex: SIGNATURE })),
    };
  });

  afterEach(() => {
    handle.close();
  });

  it('duplicate intent id cannot reserve and sign twice', async () => {
    const spendLedger = makeSpendLedger(handle.db, () => 1_717_000_000_000);
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    // Isolates replay protection (UNIQUE intent_id). The cap is set high so the
    // second same-intent reserve is NOT short-circuited by the daily cap (the
    // guard never commits, so the first 'reserved' row of 500 still counts);
    // it must reach the UNIQUE(intent_id) insert and fail reservation_conflict.
    const req = request({ policy: { perDayCapAtomic: '5000' } });
    expect((await guard.authorize(req)).ok).toBe(true);
    const replay = await guard.authorize(req);

    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('reservation_conflict');
    expect(signer.sign).toHaveBeenCalledTimes(1);
  });

  it('daily cap denial prevents signing', async () => {
    const spendLedger = makeSpendLedger(handle.db, () => 1_717_000_000_000);
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    // First reserve consumes the full daily cap (500/500). Reserved spend counts
    // even though the guard never commits, so a second DIFFERENT-intent request
    // for even 1 atomic unit exceeds the cap. Amount 1 is well under the single
    // cap (500), so the denial is day_cap_exceeded (NOT amount_above_single_cap).
    expect((await guard.authorize(request())).ok).toBe(true);
    const denied = await guard.authorize(
      request({ intentId: 'intent-2', traceId: 'trace-2', intendedAmountAtomic: '1' }),
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('day_cap_exceeded');
    expect(signer.sign).toHaveBeenCalledTimes(1);
  });
});
