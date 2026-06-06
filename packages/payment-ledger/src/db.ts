import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type LedgerDb = BetterSQLite3Database<typeof schema>;

export interface LedgerHandle {
  db: LedgerDb;
  sqlite: Database.Database;
  close(): void;
}

const DDL = `
CREATE TABLE IF NOT EXISTS payment_ledger (
  id            TEXT PRIMARY KEY,
  payer         TEXT NOT NULL,
  asset         TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  amount        TEXT NOT NULL,
  network       TEXT NOT NULL,
  state         TEXT NOT NULL,
  settle_deploy_hash TEXT,
  trace_id      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (nonce, payer, asset),
  UNIQUE (payload_hash)
);
CREATE INDEX IF NOT EXISTS ix_payment_ledger_trace ON payment_ledger(trace_id);
`;

export function openLedgerDb(filename = ':memory:'): LedgerHandle {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(DDL);
  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
