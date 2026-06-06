import { randomUUID } from 'node:crypto';
import { canonicalSha256Hex } from './canonical.js';
import type { X402GatewayConfig } from './config.js';
import type { FacilitatorClient } from './facilitator-client.js';
import type { PaymentLedgerPort } from './ledger-port.js';
import { normalizeSettleResponse, normalizeVerifyResponse } from './schemas/normalize.js';
import {
  type NormalizedSettleResponse,
  type SettleRequest,
  WireSettleResponseSchema,
} from './schemas/settle.schema.js';
import { type SupportedResponse, SupportedResponseSchema } from './schemas/supported.schema.js';
import {
  type NormalizedVerifyResponse,
  type VerifyRequest,
  WireVerifyResponseSchema,
} from './schemas/verify.schema.js';

export interface X402Gateway {
  supported(): Promise<SupportedResponse>;
  verify(req: VerifyRequest): Promise<NormalizedVerifyResponse>;
  settle(req: SettleRequest): Promise<NormalizedSettleResponse>;
  config(): X402GatewayConfig;
}

export interface X402GatewayDeps {
  facilitator: FacilitatorClient;
  ledger: PaymentLedgerPort;
  clock: () => number;
  config: X402GatewayConfig;
  traceId?: () => string;
}

export function makeX402Gateway(deps: X402GatewayDeps): X402Gateway {
  const nextTraceId = deps.traceId ?? (() => randomUUID());

  return {
    async supported(): Promise<SupportedResponse> {
      return SupportedResponseSchema.parse(await deps.facilitator.supported());
    },

    async verify(req: VerifyRequest): Promise<NormalizedVerifyResponse> {
      const wire = WireVerifyResponseSchema.parse(await deps.facilitator.verify(req));
      const auth = req.paymentPayload.payload.authorization;
      const normalized = normalizeVerifyResponse(wire, auth.from);
      if (!normalized.isValid) return normalized;

      const inserted = await deps.ledger.insertVerified({
        payer: normalized.payer,
        asset: req.paymentRequirements.asset,
        nonce: auth.nonce,
        payloadHash: canonicalSha256Hex(auth),
        amount: req.paymentRequirements.amount,
        network: req.paymentPayload.network,
        traceId: nextTraceId(),
      });
      if (!inserted.ok) return { isValid: false, invalidReason: 'replay_detected' };
      return normalized;
    },

    async settle(req: SettleRequest): Promise<NormalizedSettleResponse> {
      const wire = WireSettleResponseSchema.parse(await deps.facilitator.settle(req));
      const normalized = normalizeSettleResponse(wire);
      const auth = req.paymentPayload.payload.authorization;
      const row = await deps.ledger.findByPayloadHash(canonicalSha256Hex(auth));
      if (row) {
        if (normalized.success) {
          await deps.ledger.markSettled(row.id, normalized.transaction.deployHash);
        } else {
          await deps.ledger.markFailed(row.id, normalized.errorReason);
        }
      }
      return normalized;
    },

    config(): X402GatewayConfig {
      return deps.config;
    },
  };
}
