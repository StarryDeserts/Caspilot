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
        const spent = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
        const requested = BigInt(reservation.amount);
        if (spent + requested > BigInt(dayCapAtomic)) {
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
        .where(and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')))
        .run();
    },

    async release(reservationId): Promise<void> {
      db.update(signerSpendLedger)
        .set({ status: 'released', updatedAt: clock() })
        .where(and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')))
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
