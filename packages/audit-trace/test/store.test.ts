import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { AuditTraceStore, runAuditMigrations } from '../src/index.js';

describe('AuditTraceStore', () => {
  it('inserts a trace and reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-audit-'));
    try {
      const db = new Database(join(dir, 't.sqlite'));
      db.pragma('journal_mode = WAL');
      runAuditMigrations(db);
      const store = new AuditTraceStore(db);
      const id = store.append({
        intentId: 'int_x',
        state: 'POLICY_VALIDATED',
        atMs: 1_700_000_000_000,
        kind: 'policy_check',
        payload: { allowed: true, policyDigest: 'd'.repeat(64) },
      });
      expect(id).toBeGreaterThan(0);
      const all = store.listByIntent('int_x');
      expect(all).toHaveLength(1);
      expect(all[0]?.kind).toBe('policy_check');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
