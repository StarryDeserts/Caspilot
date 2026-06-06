import type { PaymentLedgerRowSelect } from './schema.js';

/**
 * Row handed to the ledger at verify time. The caller (gateway) is responsible
 * for computing `payloadHash` = sha256(canonical_json(payload.authorization))
 * and for branding/validating the hex strings; the ledger stores them opaquely.
 */
export interface PaymentLedgerInsert {
  payer: string;
  asset: string;
  nonce: string;
  payloadHash: string;
  amount: string;
  network: string;
  traceId: string;
}

export type LedgerState = 'verified' | 'settled' | 'failed';

export type PaymentLedgerRow = PaymentLedgerRowSelect;

export type LedgerInsertResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'replay_detected' };

export interface PaymentLedger {
  insertVerified(row: PaymentLedgerInsert): Promise<LedgerInsertResult>;
  markSettled(id: string, deployHash: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  findByPayloadHash(h: string): Promise<PaymentLedgerRow | null>;
}
