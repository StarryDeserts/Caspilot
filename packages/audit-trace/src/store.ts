import type { Database as SqliteDb } from 'better-sqlite3';

export interface AuditTraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface AuditTraceRow {
  id: number;
  intent_id: string;
  state: string;
  at_ms: number;
  kind: string;
  payload_json: string;
}

export class AuditTraceStore {
  constructor(private readonly db: SqliteDb) {}

  append(e: AuditTraceEntry): number {
    const info = this.db
      .prepare(
        `INSERT INTO audit_trace (intent_id, state, at_ms, kind, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(e.intentId, e.state, e.atMs, e.kind, JSON.stringify(e.payload));
    return Number(info.lastInsertRowid);
  }

  listByIntent(intentId: string): AuditTraceRow[] {
    return this.db
      .prepare('SELECT * FROM audit_trace WHERE intent_id=? ORDER BY at_ms ASC, id ASC')
      .all(intentId) as AuditTraceRow[];
  }
}
