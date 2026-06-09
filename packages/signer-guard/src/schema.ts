import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const signerSpendLedger = sqliteTable(
  'signer_spend_ledger',
  {
    id: text('id').primaryKey(),
    signerRole: text('signer_role').notNull(),
    signerPk: text('signer_pk').notNull(),
    token: text('token').notNull(),
    dayUtc: text('day_utc').notNull(),
    amount: text('amount').notNull(),
    status: text('status', { enum: ['reserved', 'committed', 'released'] }).notNull(),
    intentId: text('intent_id').notNull(),
    traceId: text('trace_id').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_signer_spend_intent').on(t.intentId),
    index('ix_signer_spend_day').on(t.signerRole, t.signerPk, t.token, t.dayUtc, t.status),
  ],
);

export type SignerSpendLedgerRow = typeof signerSpendLedger.$inferSelect;
