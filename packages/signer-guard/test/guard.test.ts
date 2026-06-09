import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSignerGuard } from '../src/guard.js';
import { computePolicyDigest } from '../src/digest.js';
import type { RawSigner, SignRequest } from '../src/types.js';
import type { SpendLedger } from '../src/spend-ledger.js';

const RECEIVER = `00${'a'.repeat(64)}`;
const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const CONTRACT = '2'.repeat(64);
const BODY_HASH = '3'.repeat(64);
const SIGNATURE = '4'.repeat(130);

function request(overrides: Partial<SignRequest> = {}): SignRequest {
  const base: SignRequest = {
    policy: {
      signerRole: 'local_dev',
      allowedChainIds: ['casper:casper-test'],
      allowedContractPackages: [CONTRACT],
      allowedTokens: [TOKEN],
      receiverPolicy: 'allowlist',
      allowedReceivers: [RECEIVER],
      maxSinglePaymentAtomic: '500',
      perDayCapAtomic: '5000',
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

describe('SignerGuard.authorize', () => {
  let spendLedger: SpendLedger;
  let signer: RawSigner;

  beforeEach(() => {
    spendLedger = {
      reserve: vi.fn(async () => ({ ok: true, reservationId: 'reservation-1' }) as const),
      commit: vi.fn(async () => {}),
      release: vi.fn(async () => {}),
      releaseExpired: vi.fn(async () => 0),
    };
    signer = {
      signerRole: 'local_dev',
      signerPk: SIGNER_PK,
      sign: vi.fn(async () => ({ signatureHex: SIGNATURE })),
    };
  });

  it('reserves spend before signing and returns the signature', async () => {
    const req = request();
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(req);

    expect(result).toEqual({
      ok: true,
      signatureHex: SIGNATURE,
      reservationId: 'reservation-1',
      policyDigest: computePolicyDigest(req.policy),
    });
    expect(spendLedger.reserve).toHaveBeenCalledWith(
      {
        signerRole: 'local_dev',
        signerPk: SIGNER_PK,
        token: TOKEN,
        dayUtc: '2024-05-29',
        amount: '500',
        intentId: 'intent-1',
        traceId: 'trace-1',
      },
      '5000',
    );
    expect(signer.sign).toHaveBeenCalledWith(req.unsignedDeploy);
  });

  it('denies a malformed intended amount before reserving or signing', async () => {
    const req = request({ intendedAmountAtomic: '12.5' });
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(req);

    expect(result).toEqual({
      ok: false,
      reason: 'amount_malformed',
      policyDigest: computePolicyDigest(req.policy),
    });
    expect(spendLedger.reserve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('denies role mismatch before reserve or sign', async () => {
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request({ signerRole: 'demo_sponsored' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signer_role_mismatch');
    expect(spendLedger.reserve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('does not reserve or sign when a policy rule denies the request', async () => {
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request({ traceId: '' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('trace_id_missing');
    expect(spendLedger.reserve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('does not sign when reservation fails', async () => {
    spendLedger.reserve = vi.fn(async () => ({ ok: false, reason: 'day_cap_exceeded' }) as const);
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('day_cap_exceeded');
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('releases the reservation and returns no signature when signer throws', async () => {
    signer.sign = vi.fn(async () => {
      throw new Error('signer unavailable');
    });
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signer_failed');
    expect(spendLedger.release).toHaveBeenCalledWith('reservation-1');
    expect(result).not.toHaveProperty('signatureHex');
  });
});
