import type { Database as SqliteDb } from 'better-sqlite3';

export const CREATE_AUDIT_TRACE_SQL = `
CREATE TABLE IF NOT EXISTS audit_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL,
  state TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_trace_intent_idx ON audit_trace(intent_id, at_ms);
`;

export function runAuditMigrations(db: SqliteDb): void {
  db.exec(CREATE_AUDIT_TRACE_SQL);
}
