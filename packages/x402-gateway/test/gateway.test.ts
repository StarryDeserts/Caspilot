import { describe, expect, it, vi } from 'vitest';
import { canonicalSha256Hex } from '../src/canonical.js';
import type { X402GatewayConfig } from '../src/config.js';
import type { FacilitatorClient } from '../src/facilitator-client.js';
import { makeX402Gateway } from '../src/gateway.js';
import type { LedgerInsertResult, LedgerRowRef, PaymentLedgerPort } from '../src/ledger-port.js';
import { VerifyRequestSchema } from '../src/schemas/verify.schema.js';

import settleFailureWire from '../__fixtures__/settle-response-failure.wire.json' with {
  type: 'json',
};
import settleSuccessWire from '../__fixtures__/settle-response-success.wire.json' with {
  type: 'json',
};
import supportedResponse from '../__fixtures__/supported-response.json' with { type: 'json' };
import verifyRequest from '../__fixtures__/verify-request.exact-casper.json' with { type: 'json' };
import verifyFailureWire from '../__fixtures__/verify-response-failure.wire.json' with {
  type: 'json',
};
import verifyNoPayerWire from '../__fixtures__/verify-response-success.wire.no-payer.json' with {
  type: 'json',
};
import verifyWithPayerWire from '../__fixtures__/verify-response-success.wire.with-payer.json' with {
  type: 'json',
};

const req = VerifyRequestSchema.parse(verifyRequest);
const auth = req.paymentPayload.payload.authorization;
const PAYLOAD_HASH = canonicalSha256Hex(auth);
const DEPLOY_HASH = settleSuccessWire.transaction;

const config: X402GatewayConfig = {
  facilitatorUrl: 'https://fac.test',
  mode: 'mock',
  assets: [],
};

function fakeFacilitator(overrides: Partial<FacilitatorClient> = {}): FacilitatorClient {
  return {
    supported: vi.fn(async () => supportedResponse),
    verify: vi.fn(async () => verifyWithPayerWire),
    settle: vi.fn(async () => settleSuccessWire),
    ...overrides,
  };
}

function fakeLedger(overrides: Partial<PaymentLedgerPort> = {}): PaymentLedgerPort {
  return {
    insertVerified: vi.fn(async (): Promise<LedgerInsertResult> => ({ ok: true, id: 'row-1' })),
    markSettled: vi.fn(async (): Promise<void> => {}),
    markFailed: vi.fn(async (): Promise<void> => {}),
    findByPayloadHash: vi.fn(async (): Promise<LedgerRowRef | null> => ({ id: 'row-1' })),
    ...overrides,
  };
}

function makeGateway(deps: { facilitator?: FacilitatorClient; ledger?: PaymentLedgerPort } = {}) {
  const facilitator = deps.facilitator ?? fakeFacilitator();
  const ledger = deps.ledger ?? fakeLedger();
  const gateway = makeX402Gateway({
    facilitator,
    ledger,
    clock: () => 1_717_000_000_000,
    config,
    traceId: () => 'trace-1',
  });
  return { gateway, facilitator, ledger };
}

describe('makeX402Gateway — supported()', () => {
  it('returns the facilitator response parsed as a SupportedResponse', async () => {
    const { gateway } = makeGateway();
    const out = await gateway.supported();
    expect(out.kinds).toHaveLength(1);
    expect(out.kinds[0]?.network).toBe('casper:casper-test');
  });
});

describe('makeX402Gateway — verify() replay ledger integration (§3B.0)', () => {
  it('records a ledger row keyed by the canonical authorization hash on success', async () => {
    const { gateway, ledger } = makeGateway();

    const out = await gateway.verify(req);

    expect(out).toEqual({ isValid: true, payer: auth.from });
    expect(ledger.insertVerified).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ledger.insertVerified).mock.calls[0]?.[0]).toEqual({
      payer: auth.from,
      asset: req.paymentRequirements.asset,
      nonce: auth.nonce,
      payloadHash: PAYLOAD_HASH,
      amount: req.paymentRequirements.amount,
      network: req.paymentPayload.network,
      traceId: 'trace-1',
    });
  });

  it('cross-fills payer from authorization.from when the wire omits it', async () => {
    const facilitator = fakeFacilitator({ verify: vi.fn(async () => verifyNoPayerWire) });
    const { gateway, ledger } = makeGateway({ facilitator });

    const out = await gateway.verify(req);

    expect(out).toEqual({ isValid: true, payer: auth.from });
    expect(vi.mocked(ledger.insertVerified).mock.calls[0]?.[0]?.payer).toBe(auth.from);
  });

  it('returns the invalid reason and never touches the ledger on a failed verification', async () => {
    const facilitator = fakeFacilitator({ verify: vi.fn(async () => verifyFailureWire) });
    const { gateway, ledger } = makeGateway({ facilitator });

    const out = await gateway.verify(req);

    expect(out).toEqual({ isValid: false, invalidReason: 'signature_invalid' });
    expect(ledger.insertVerified).not.toHaveBeenCalled();
  });

  it('maps a ledger uniqueness collision to invalidReason replay_detected', async () => {
    const ledger = fakeLedger({
      insertVerified: vi.fn(
        async (): Promise<LedgerInsertResult> => ({
          ok: false,
          reason: 'replay_detected',
        }),
      ),
    });
    const { gateway } = makeGateway({ ledger });

    const out = await gateway.verify(req);

    expect(out).toEqual({ isValid: false, invalidReason: 'replay_detected' });
  });
});

describe('makeX402Gateway — settle() ledger reconciliation (§3B.0)', () => {
  it('marks the matching ledger row settled with the deploy hash on success', async () => {
    const { gateway, ledger } = makeGateway();

    const out = await gateway.settle(req);

    expect(out).toEqual({
      success: true,
      transaction: { chainId: 'casper:casper-test', deployHash: DEPLOY_HASH },
      payer: auth.from,
    });
    expect(ledger.findByPayloadHash).toHaveBeenCalledWith(PAYLOAD_HASH);
    expect(ledger.markSettled).toHaveBeenCalledWith('row-1', DEPLOY_HASH);
    expect(ledger.markFailed).not.toHaveBeenCalled();
  });

  it('marks the matching ledger row failed with the error reason on failure', async () => {
    const facilitator = fakeFacilitator({ settle: vi.fn(async () => settleFailureWire) });
    const { gateway, ledger } = makeGateway({ facilitator });

    const out = await gateway.settle(req);

    expect(out).toEqual({ success: false, errorReason: 'replay_detected' });
    expect(ledger.markFailed).toHaveBeenCalledWith('row-1', 'replay_detected');
    expect(ledger.markSettled).not.toHaveBeenCalled();
  });

  it('still returns the normalized response when no ledger row matches', async () => {
    const ledger = fakeLedger({
      findByPayloadHash: vi.fn(async (): Promise<LedgerRowRef | null> => null),
    });
    const { gateway } = makeGateway({ ledger });

    const out = await gateway.settle(req);

    expect(out.success).toBe(true);
    expect(ledger.markSettled).not.toHaveBeenCalled();
    expect(ledger.markFailed).not.toHaveBeenCalled();
  });
});

describe('makeX402Gateway — config()', () => {
  it('returns the gateway config unchanged', () => {
    const { gateway } = makeGateway();
    expect(gateway.config()).toBe(config);
  });
});
