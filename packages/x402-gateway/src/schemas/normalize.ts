import type { CasperAccountAddressHex } from './primitives.schema.js';
import type { NormalizedSettleResponse, WireSettleResponse } from './settle.schema.js';
import type { NormalizedVerifyResponse, WireVerifyResponse } from './verify.schema.js';

/** Cross-fill payer from the signed authorization (`payload.authorization.from`)
 *  when the facilitator's wire response omits it on success. */
export function normalizeVerifyResponse(
  wire: WireVerifyResponse,
  fallbackPayer: CasperAccountAddressHex,
): NormalizedVerifyResponse {
  if (wire.isValid) {
    return { isValid: true, payer: wire.payer ?? fallbackPayer };
  }
  return { isValid: false, invalidReason: wire.invalidReason };
}

/** Collapse the wire's bare deploy-hash string into the nested
 *  `{ chainId, deployHash }` transaction object. */
export function normalizeSettleResponse(wire: WireSettleResponse): NormalizedSettleResponse {
  if (wire.success) {
    return {
      success: true,
      transaction: { chainId: wire.network, deployHash: wire.transaction },
      payer: wire.payer,
    };
  }
  return { success: false, errorReason: wire.errorReason };
}
