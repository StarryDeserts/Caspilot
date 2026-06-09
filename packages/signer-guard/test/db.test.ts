import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';

// Characterization guard: pins the live table structure created by the raw DDL
// in db.ts so it cannot silently drift from the Drizzle declaration in
// schema.ts. These assertions are expected to pass today; their purpose is to
// catch FUTURE divergence (especially the ix_signer_spend_day index, which the
// functional ledger tests never exercise).
describe('signer-guard db schema', () => {
  let handle: SignerGuardDbHandle;

  beforeEach(() => {
    handle = openSignerGuardDb();
  });

  afterEach(() => {
    handle.close();
  });

  it('creates signer_spend_ledger with the expected 11 columns', () => {
    const columns = handle.sqlite.pragma('table_info(signer_spend_ledger)') as Array<{
      name: string;
    }>;
    const names = new Set(columns.map((c) => c.name));
    expect(names).toEqual(
      new Set([
        'id',
        'signer_role',
        'signer_pk',
        'token',
        'day_utc',
        'amount',
        'status',
        'intent_id',
        'trace_id',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('has the unique intent constraint and the named day index', () => {
    const indexes = handle.sqlite.pragma('index_list(signer_spend_ledger)') as Array<{
      name: string;
      unique: number;
    }>;
    expect(indexes.some((ix) => ix.unique === 1)).toBe(true);
    expect(indexes.some((ix) => ix.name === 'ix_signer_spend_day')).toBe(true);
  });
});
