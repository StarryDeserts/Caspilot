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

  it('orders by at_ms ascending, isolates by intent, and round-trips payload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-audit-'));
    try {
      const db = new Database(join(dir, 't.sqlite'));
      db.pragma('journal_mode = WAL');
      runAuditMigrations(db);
      const store = new AuditTraceStore(db);

      const earlierPayload = {
        allowed: true,
        policyDigest: 'd'.repeat(64),
        nested: { n: 1 },
      };

      // Append A's later row first, then A's earlier row, then B's row.
      // This makes the ascending-at_ms ordering assertion meaningful.
      store.append({
        intentId: 'A',
        state: 'POLICY_VALIDATED',
        atMs: 1_700_000_002_000,
        kind: 'policy_check',
        payload: { allowed: false },
      });
      store.append({
        intentId: 'A',
        state: 'POLICY_VALIDATED',
        atMs: 1_700_000_001_000,
        kind: 'policy_check',
        payload: earlierPayload,
      });
      store.append({
        intentId: 'B',
        state: 'POLICY_VALIDATED',
        atMs: 1_700_000_000_500,
        kind: 'policy_check',
        payload: { allowed: true },
      });

      const aRows = store.listByIntent('A');
      // Intent isolation: only A's two rows, never B's.
      expect(aRows).toHaveLength(2);
      // Ascending at_ms: the smaller timestamp comes first.
      expect(aRows[0]?.at_ms).toBe(1_700_000_001_000);
      expect(aRows[1]?.at_ms).toBe(1_700_000_002_000);
      // Payload round-trips losslessly (including nested structure).
      expect(JSON.parse(aRows[0]!.payload_json)).toEqual(earlierPayload);

      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
