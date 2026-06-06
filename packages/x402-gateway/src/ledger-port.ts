/**
 * Replay-protection port the gateway depends on. The @caspilot/payment-ledger
 * package provides a structurally-compatible adapter; keeping the port local
 * avoids a package cycle and a pre-build step in the typecheck gate. The two are
 * wired together at the API layer (Phase 3).
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

export type LedgerInsertResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'replay_detected' };

export interface LedgerRowRef {
  id: string;
}

export interface PaymentLedgerPort {
  insertVerified(row: PaymentLedgerInsert): Promise<LedgerInsertResult>;
  markSettled(id: string, deployHash: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  findByPayloadHash(h: string): Promise<LedgerRowRef | null>;
}
