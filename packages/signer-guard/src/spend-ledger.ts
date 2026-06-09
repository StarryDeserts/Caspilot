import { randomUUID } from 'node:crypto';
import { and, eq, inArray, lte } from 'drizzle-orm';
import type { CasperPublicKeyHex, Cep18PackageHashHex } from '@caspilot/x402';
import type { SignerRole } from './types.js';
import type { SignerGuardDb } from './db.js';
import { signerSpendLedger } from './schema.js';

export interface SpendReservation {
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  token: Cep18PackageHashHex;
  dayUtc: string;
  amount: string;
  intentId: string;
  traceId: string;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'day_cap_exceeded' | 'reservation_conflict' };

export interface SpendLedger {
  reserve(reservation: SpendReservation, dayCapAtomic: string): Promise<ReserveResult>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
  releaseExpired(nowMs: number, ttlMs: number): Promise<number>;
}

// A valid atomic amount is one or more ASCII digits: no sign, no decimal
// point, no whitespace, non-empty. BigInt('') and BigInt('   ') return 0n
// (they do NOT throw), which at a signing gate would silently become a
// zero-cost reservation or a zero cap. Validate here so reserve() fails
// CLOSED on malformed input — the throw precedes any insert, so no row and
// no signature can result.
function parseAtomic(label: string, value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`invalid atomic amount for ${label}: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function makeSpendLedger(db: SignerGuardDb, clock: () => number = Date.now): SpendLedger {
  return {
    async reserve(reservation, dayCapAtomic): Promise<ReserveResult> {
      // Validate inputs BEFORE the transaction so malformed amounts fail
      // closed (throw) without ever inserting a row.
      const requested = parseAtomic('amount', reservation.amount);
      const dayCap = parseAtomic('dayCapAtomic', dayCapAtomic);
      // Race-safety: the select-then-insert cap check is atomic ONLY under the
      // single synchronous better-sqlite3 writer (one process, one connection).
      // UNIQUE(intent_id) backstops a duplicate intent, but does NOT stop two
      // DIFFERENT intents from racing past the daily cap under concurrent writers.
      return db.transaction((tx) => {
        const rows = tx
          .select({ amount: signerSpendLedger.amount })
          .from(signerSpendLedger)
          .where(
            and(
              eq(signerSpendLedger.signerRole, reservation.signerRole),
              eq(signerSpendLedger.signerPk, reservation.signerPk),
              eq(signerSpendLedger.token, reservation.token),
              eq(signerSpendLedger.dayUtc, reservation.dayUtc),
              inArray(signerSpendLedger.status, ['reserved', 'committed']),
            ),
          )
          .all();
        const spent = rows.reduce((sum, row) => sum + parseAtomic('row.amount', row.amount), 0n);
        if (spent + requested > dayCap) {
          return { ok: false, reason: 'day_cap_exceeded' };
        }

        const id = randomUUID();
        const now = clock();
        try {
          tx.insert(signerSpendLedger)
            .values({
              id,
              signerRole: reservation.signerRole,
              signerPk: reservation.signerPk,
              token: reservation.token,
              dayUtc: reservation.dayUtc,
              amount: reservation.amount,
              status: 'reserved',
              intentId: reservation.intentId,
              traceId: reservation.traceId,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        } catch (err) {
          if (isUniqueViolation(err)) return { ok: false, reason: 'reservation_conflict' };
          throw err;
        }
        return { ok: true, reservationId: id };
      });
    },

    async commit(reservationId): Promise<void> {
      db.update(signerSpendLedger)
        .set({ status: 'committed', updatedAt: clock() })
        .where(
          and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')),
        )
        .run();
    },

    async release(reservationId): Promise<void> {
      db.update(signerSpendLedger)
        .set({ status: 'released', updatedAt: clock() })
        .where(
          and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')),
        )
        .run();
    },

    async releaseExpired(nowMs, ttlMs): Promise<number> {
      const result = db
        .update(signerSpendLedger)
        .set({ status: 'released', updatedAt: nowMs })
        .where(
          and(
            eq(signerSpendLedger.status, 'reserved'),
            lte(signerSpendLedger.createdAt, nowMs - ttlMs),
          ),
        )
        .run();
      return result.changes;
    },
  };
}

export function dayUtcFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
