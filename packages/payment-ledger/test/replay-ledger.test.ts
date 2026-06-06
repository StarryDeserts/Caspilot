import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LedgerHandle, openLedgerDb } from '../src/db.js';
import { makePaymentLedger } from '../src/ledger.js';
import { paymentLedger } from '../src/schema.js';
import type { PaymentLedger, PaymentLedgerInsert } from '../src/types.js';

const NONCE = 'n'.repeat(64);
const PAYER_A = `00${'a'.repeat(64)}`;
const PAYER_B = `00${'b'.repeat(64)}`;
const ASSET_X = 'x'.repeat(64);
const ASSET_Y = 'y'.repeat(64);
const HASH_1 = '1'.repeat(64);
const HASH_2 = '2'.repeat(64);
const NETWORK = 'casper:casper-test';
const DEPLOY = 'd'.repeat(64);
const CLOCK = () => 1717000000000;

function row(over: Partial<PaymentLedgerInsert> = {}): PaymentLedgerInsert {
  return {
    payer: PAYER_A,
    asset: ASSET_X,
    nonce: NONCE,
    payloadHash: HASH_1,
    amount: '1000000000',
    network: NETWORK,
    traceId: 'trace-1',
    ...over,
  };
}

describe('payment-ledger replay protection', () => {
  let handle: LedgerHandle;
  let ledger: PaymentLedger;

  beforeEach(() => {
    handle = openLedgerDb();
    ledger = makePaymentLedger(handle.db, CLOCK);
  });

  afterEach(() => {
    handle.close();
  });

  it('inserts (nonce, payer, asset, payload_hash) once successfully', async () => {
    const result = await ledger.insertVerified(row());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toMatch(/^[0-9a-f-]{36}$/);

    const found = await ledger.findByPayloadHash(HASH_1);
    expect(found).not.toBeNull();
    if (found) {
      expect(found.state).toBe('verified');
      expect(found.payer).toBe(PAYER_A);
      expect(found.nonce).toBe(NONCE);
      expect(found.createdAt).toBe(1717000000000);
      expect(found.settleDeployHash).toBeNull();
    }
  });

  it('rejects duplicate (nonce, payer, asset) with replay_detected', async () => {
    const first = await ledger.insertVerified(row());
    expect(first.ok).toBe(true);
    // Same (nonce, payer, asset) but a different payload_hash isolates this constraint.
    const second = await ledger.insertVerified(row({ payloadHash: HASH_2 }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('replay_detected');
  });

  it('rejects duplicate payload_hash regardless of payer', async () => {
    const first = await ledger.insertVerified(row());
    expect(first.ok).toBe(true);
    // Different payer + asset + nonce, but the same payload_hash → still a replay.
    const second = await ledger.insertVerified(
      row({ payer: PAYER_B, asset: ASSET_Y, nonce: 'm'.repeat(64) }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('replay_detected');
  });

  it('allows same nonce for different payer+asset combinations', async () => {
    const base = await ledger.insertVerified(row());
    expect(base.ok).toBe(true);

    const diffPayer = await ledger.insertVerified(row({ payer: PAYER_B, payloadHash: HASH_2 }));
    expect(diffPayer.ok).toBe(true);

    const diffAsset = await ledger.insertVerified(
      row({ asset: ASSET_Y, payloadHash: '3'.repeat(64) }),
    );
    expect(diffAsset.ok).toBe(true);
  });

  it('markSettled flips state to settled and stores the deploy hash', async () => {
    const inserted = await ledger.insertVerified(row());
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    await ledger.markSettled(inserted.id, DEPLOY);
    const found = await ledger.findByPayloadHash(HASH_1);
    expect(found?.state).toBe('settled');
    expect(found?.settleDeployHash).toBe(DEPLOY);
  });

  it('markFailed flips state to failed', async () => {
    const inserted = await ledger.insertVerified(row());
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    await ledger.markFailed(inserted.id, 'signature_invalid');
    const found = await ledger.findByPayloadHash(HASH_1);
    expect(found?.state).toBe('failed');
  });

  it('findByPayloadHash returns null for an unknown hash', async () => {
    expect(await ledger.findByPayloadHash('f'.repeat(64))).toBeNull();
  });

  it('writes are atomic — a failed transaction leaves no ledger row', async () => {
    expect(() =>
      handle.db.transaction((tx) => {
        tx.insert(paymentLedger)
          .values({
            id: 'tx-rollback',
            payer: PAYER_A,
            asset: ASSET_X,
            nonce: NONCE,
            payloadHash: HASH_1,
            amount: '1000000000',
            network: NETWORK,
            state: 'verified',
            settleDeployHash: null,
            traceId: 'trace-rollback',
            createdAt: CLOCK(),
          })
          .run();
        throw new Error('transfer failed');
      }),
    ).toThrow('transfer failed');

    expect(await ledger.findByPayloadHash(HASH_1)).toBeNull();
  });
});

describe('payment-ledger durability', () => {
  it('UNIQUE indexes survive a WAL checkpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-ledger-'));
    const handle = openLedgerDb(join(dir, 'ledger.db'));
    const ledger = makePaymentLedger(handle.db, CLOCK);
    try {
      expect(handle.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');

      const first = await ledger.insertVerified(row());
      expect(first.ok).toBe(true);

      handle.sqlite.pragma('wal_checkpoint(TRUNCATE)');

      const replay = await ledger.insertVerified(row());
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.reason).toBe('replay_detected');
    } finally {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
