import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';
import { makeSpendLedger } from '../src/spend-ledger.js';
import type { SpendLedger, SpendReservation } from '../src/spend-ledger.js';

const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);

function reservation(overrides: Partial<SpendReservation> = {}): SpendReservation {
  return {
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    token: TOKEN,
    dayUtc: '2026-06-08',
    amount: '500',
    intentId: 'intent-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('SpendLedger reservation model', () => {
  let handle: SignerGuardDbHandle;
  let ledger: SpendLedger;
  let now = 1_717_000_000_000;

  beforeEach(() => {
    handle = openSignerGuardDb();
    ledger = makeSpendLedger(handle.db, () => now);
  });

  afterEach(() => {
    handle.close();
  });

  it('first reserve under cap succeeds and returns a reservation id', async () => {
    const result = await ledger.reserve(reservation(), '1000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reserved plus committed spend counts toward the day cap', async () => {
    const first = await ledger.reserve(reservation({ amount: '600' }), '1000');
    expect(first.ok).toBe(true);
    if (first.ok) await ledger.commit(first.reservationId);

    const second = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', amount: '500' }),
      '1000',
    );
    expect(second).toEqual({ ok: false, reason: 'day_cap_exceeded' });
  });

  it('release frees reserved spend for another intent', async () => {
    const first = await ledger.reserve(reservation({ amount: '900' }), '1000');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await ledger.release(first.reservationId);
    const second = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', amount: '900' }),
      '1000',
    );
    expect(second.ok).toBe(true);
  });

  it('UNIQUE(intent_id) prevents double reserve for the same intent', async () => {
    expect((await ledger.reserve(reservation(), '1000')).ok).toBe(true);
    expect(await ledger.reserve(reservation({ amount: '100' }), '1000')).toEqual({
      ok: false,
      reason: 'reservation_conflict',
    });
  });

  it('day_utc rollover starts a fresh cap window', async () => {
    expect((await ledger.reserve(reservation({ amount: '1000' }), '1000')).ok).toBe(true);
    const nextDay = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', dayUtc: '2026-06-09', amount: '1000' }),
      '1000',
    );
    expect(nextDay.ok).toBe(true);
  });

  it('releaseExpired releases stale reserved rows and returns the count', async () => {
    now = 1_000;
    const stale = await ledger.reserve(reservation({ intentId: 'stale', traceId: 'trace-stale' }), '1000');
    expect(stale.ok).toBe(true);
    now = 10_000;
    const fresh = await ledger.reserve(reservation({ intentId: 'fresh', traceId: 'trace-fresh' }), '1000');
    expect(fresh.ok).toBe(true);

    const released = await ledger.releaseExpired(10_000, 5_000);
    expect(released).toBe(1);

    const afterExpiry = await ledger.reserve(
      reservation({ intentId: 'after-expiry', traceId: 'trace-after', amount: '500' }),
      '1000',
    );
    expect(afterExpiry.ok).toBe(true);
  });
});
