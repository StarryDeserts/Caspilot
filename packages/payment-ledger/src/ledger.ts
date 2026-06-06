import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { LedgerDb } from './db.js';
import { paymentLedger } from './schema.js';
import type {
  LedgerInsertResult,
  PaymentLedger,
  PaymentLedgerInsert,
  PaymentLedgerRow,
} from './types.js';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function makePaymentLedger(db: LedgerDb, clock: () => number = Date.now): PaymentLedger {
  return {
    async insertVerified(row: PaymentLedgerInsert): Promise<LedgerInsertResult> {
      const id = randomUUID();
      try {
        db.insert(paymentLedger)
          .values({
            id,
            payer: row.payer,
            asset: row.asset,
            nonce: row.nonce,
            payloadHash: row.payloadHash,
            amount: row.amount,
            network: row.network,
            state: 'verified',
            settleDeployHash: null,
            traceId: row.traceId,
            createdAt: clock(),
          })
          .run();
        return { ok: true, id };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, reason: 'replay_detected' };
        throw err;
      }
    },

    async markSettled(id: string, deployHash: string): Promise<void> {
      db.update(paymentLedger)
        .set({ state: 'settled', settleDeployHash: deployHash })
        .where(eq(paymentLedger.id, id))
        .run();
    },

    // The LOCKED §3B.2 schema has no reason column; the failure reason lives in
    // the audit trace keyed by trace_id. Here we only persist the state flip.
    async markFailed(id: string, _reason: string): Promise<void> {
      db.update(paymentLedger).set({ state: 'failed' }).where(eq(paymentLedger.id, id)).run();
    },

    async findByPayloadHash(h: string): Promise<PaymentLedgerRow | null> {
      const rows = db
        .select()
        .from(paymentLedger)
        .where(eq(paymentLedger.payloadHash, h))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },
  };
}
