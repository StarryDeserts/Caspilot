import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type SignerGuardDb = BetterSQLite3Database<typeof schema>;

export interface SignerGuardDbHandle {
  db: SignerGuardDb;
  sqlite: Database.Database;
  close(): void;
}

const DDL = `
CREATE TABLE IF NOT EXISTS signer_spend_ledger (
  id           TEXT PRIMARY KEY,
  signer_role  TEXT NOT NULL,
  signer_pk    TEXT NOT NULL,
  token        TEXT NOT NULL,
  day_utc      TEXT NOT NULL,
  amount       TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('reserved', 'committed', 'released')),
  intent_id    TEXT NOT NULL,
  trace_id     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (intent_id)
);
CREATE INDEX IF NOT EXISTS ix_signer_spend_day
  ON signer_spend_ledger(signer_role, signer_pk, token, day_utc, status);
`;

export function openSignerGuardDb(filename = ':memory:'): SignerGuardDbHandle {
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
