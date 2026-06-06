import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * §3B.2 LOCKED — x402 replay-protection ledger.
 * UNIQUE(nonce, payer, asset) + UNIQUE(payload_hash) enforce single-use payments.
 */
export const paymentLedger = sqliteTable(
  'payment_ledger',
  {
    id: text('id').primaryKey(),
    payer: text('payer').notNull(),
    asset: text('asset').notNull(),
    nonce: text('nonce').notNull(),
    payloadHash: text('payload_hash').notNull(),
    amount: text('amount').notNull(),
    network: text('network').notNull(),
    state: text('state', { enum: ['verified', 'settled', 'failed'] }).notNull(),
    settleDeployHash: text('settle_deploy_hash'),
    traceId: text('trace_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_payment_ledger_nonce_payer_asset').on(t.nonce, t.payer, t.asset),
    uniqueIndex('uq_payment_ledger_payload_hash').on(t.payloadHash),
    index('ix_payment_ledger_trace').on(t.traceId),
  ],
);

export type PaymentLedgerRowSelect = typeof paymentLedger.$inferSelect;
