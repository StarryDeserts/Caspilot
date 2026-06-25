import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';
import { makeSpendLedger } from '../src/spend-ledger.js';
import type { SpendLedger, SpendReservation } from '../src/spend-ledger.js';

const SIGNER_PK = `01${'c'.repeat(64)}`;
const OTHER_PK = `01${'d'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const OTHER_TOKEN = '2'.repeat(64);
const DAY = '2026-06-08';

function reservation(overrides: Partial<SpendReservation> = {}): SpendReservation {
  return {
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    token: TOKEN,
    dayUtc: DAY,
    amount: '500',
    intentId: 'intent-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

const scope = { signerRole: 'local_dev' as const, signerPk: SIGNER_PK, token: TOKEN };

describe('SpendLedger read projections (usedOnDay / listForSigner)', () => {
  let handle: SignerGuardDbHandle;
  let ledger: SpendLedger;
  let now = 1_000;

  beforeEach(() => {
    handle = openSignerGuardDb();
    ledger = makeSpendLedger(handle.db, () => now);
  });

  afterEach(() => {
    handle.close();
  });

  describe('usedOnDay', () => {
    it('returns "0" when nothing is reserved', () => {
      expect(ledger.usedOnDay({ ...scope, dayUtc: DAY })).toBe('0');
    });

    it('sums reserved + committed amounts for the day', async () => {
      const a = await ledger.reserve(reservation({ amount: '600', intentId: 'a' }), '100000');
      expect(a.ok).toBe(true);
      if (a.ok) await ledger.commit(a.reservationId); // committed
      await ledger.reserve(reservation({ amount: '400', intentId: 'b' }), '100000'); // reserved
      expect(ledger.usedOnDay({ ...scope, dayUtc: DAY })).toBe('1000');
    });

    it('excludes released reservations (returned budget)', async () => {
      const a = await ledger.reserve(reservation({ amount: '700', intentId: 'a' }), '100000');
      expect(a.ok).toBe(true);
      if (a.ok) await ledger.release(a.reservationId);
      await ledger.reserve(reservation({ amount: '300', intentId: 'b' }), '100000');
      expect(ledger.usedOnDay({ ...scope, dayUtc: DAY })).toBe('300');
    });

    it('is scoped to the given day, token, and signer', async () => {
      await ledger.reserve(reservation({ amount: '100', intentId: 'today' }), '100000');
      await ledger.reserve(
        reservation({ amount: '999', intentId: 'otherday', dayUtc: '2026-06-09' }),
        '100000',
      );
      await ledger.reserve(
        reservation({ amount: '999', intentId: 'othertoken', token: OTHER_TOKEN }),
        '100000',
      );
      await ledger.reserve(
        reservation({ amount: '999', intentId: 'othersigner', signerPk: OTHER_PK }),
        '100000',
      );
      expect(ledger.usedOnDay({ ...scope, dayUtc: DAY })).toBe('100');
    });

    it('fails closed (throws) when a counted row has a non-digit amount', async () => {
      // Mirror reserve()'s cap-sum: a corrupted reserved row must not be silently
      // coerced (BigInt('') -> 0n) into an under-count. A read that can't be
      // computed honestly throws rather than report a wrong number.
      handle.sqlite
        .prepare(
          `INSERT INTO signer_spend_ledger
            (id, signer_role, signer_pk, token, day_utc, amount, status, intent_id, trace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?)`,
        )
        .run(
          'corrupt',
          'local_dev',
          SIGNER_PK,
          TOKEN,
          DAY,
          '',
          'corrupt-intent',
          'corrupt-trace',
          now,
          now,
        );
      expect(() => ledger.usedOnDay({ ...scope, dayUtc: DAY })).toThrow(TypeError);
    });
  });

  describe('listForSigner', () => {
    it('returns reserved+committed rows newest-first within the limit, scoped to signer+token', async () => {
      now = 1000;
      await ledger.reserve(reservation({ amount: '100', intentId: 'oldest' }), '100000');
      now = 2000;
      await ledger.reserve(reservation({ amount: '200', intentId: 'middle' }), '100000');
      now = 3000;
      await ledger.reserve(reservation({ amount: '300', intentId: 'newest' }), '100000');
      now = 4000;
      await ledger.reserve(
        reservation({ amount: '900', intentId: 'othertoken', token: OTHER_TOKEN }),
        '100000',
      );

      const rows = ledger.listForSigner({ ...scope, limit: 2 });
      expect(rows.map((r) => r.intentId)).toEqual(['newest', 'middle']);
    });

    it('includes reserved and committed but not released, preserving status', async () => {
      now = 1000;
      const a = await ledger.reserve(
        reservation({ amount: '100', intentId: 'committed' }),
        '100000',
      );
      if (a.ok) await ledger.commit(a.reservationId);
      now = 2000;
      await ledger.reserve(reservation({ amount: '200', intentId: 'reserved' }), '100000');
      now = 3000;
      const c = await ledger.reserve(
        reservation({ amount: '300', intentId: 'released' }),
        '100000',
      );
      if (c.ok) await ledger.release(c.reservationId);

      const rows = ledger.listForSigner({ ...scope, limit: 10 });
      expect(rows.map((r) => `${r.intentId}:${r.status}`)).toEqual([
        'reserved:reserved',
        'committed:committed',
      ]);
    });

    it('returns an empty array when the signer has no rows', () => {
      expect(ledger.listForSigner({ ...scope, limit: 10 })).toEqual([]);
    });
  });
});
