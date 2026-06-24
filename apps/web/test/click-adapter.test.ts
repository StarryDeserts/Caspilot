import { describe, it, expect, vi } from 'vitest';
import { makeClickAdapter, CASPER_WALLET_KEY, type ClickRefLike } from '../src/lib/click-adapter.js';

const PK = '01' + 'ab'.repeat(32);
const HASH = 'dd'.repeat(32);
const TX = { deploy: { header: { account: PK } } };

// A successful SendResult as the real SDK emits it: a real deployHash, no error,
// not cancelled. The adapter must normalize this to the ClickSendResult seam.
function sentResult(over: Record<string, unknown> = {}) {
  return {
    cancelled: false,
    deployHash: HASH,
    transactionHash: null,
    status: 'sent',
    error: null,
    errorData: null,
    csprCloudTransaction: null,
    ...over,
  };
}

// Minimal fake of the CSPR.click SDK slice the adapter consumes. Tests override the
// three methods per case; defaults model a wallet with no active session.
function fakeClickRef(over: Partial<ClickRefLike> = {}): ClickRefLike {
  return {
    getActiveAccount: vi.fn(() => null),
    getProviderInstance: vi.fn(async () => ({})),
    connect: vi.fn(async () => ({ public_key: PK })),
    send: vi.fn(async () => sentResult()),
    ...over,
  };
}

describe('makeClickAdapter — connect', () => {
  it('reuses an already-active account without popping the wallet', async () => {
    const clickRef = fakeClickRef({
      getActiveAccount: vi.fn(() => ({ public_key: PK })),
    });
    const adapter = makeClickAdapter(clickRef);

    const acc = await adapter.connect();

    expect(acc).toEqual({ publicKey: PK });
    // No active-session ⇒ popup; here there IS one, so connect() must NOT be called.
    expect(clickRef.connect).not.toHaveBeenCalled();
  });

  it('pops the casper-wallet provider when no account is active and maps public_key', async () => {
    const connect = vi.fn(async () => ({ public_key: PK }));
    const adapter = makeClickAdapter(fakeClickRef({ connect }));

    const acc = await adapter.connect();

    expect(acc).toEqual({ publicKey: PK });
    expect(connect).toHaveBeenCalledWith(CASPER_WALLET_KEY);
  });

  it('throws when the provider connect resolves with no account (cancelled)', async () => {
    const adapter = makeClickAdapter(
      fakeClickRef({ connect: vi.fn(async () => undefined) }),
    );

    await expect(adapter.connect()).rejects.toThrow(/no account/i);
  });
});

describe('makeClickAdapter — send', () => {
  it('passes the backend-built tx and signer pk straight to clickRef.send', async () => {
    const send = vi.fn(async () => sentResult());
    const adapter = makeClickAdapter(fakeClickRef({ send }));

    await adapter.send({ txJson: TX, signerPk: PK });

    // The 3rd arg is the status callback the adapter threads in to hand off on the
    // early `sent` update; the tx + signer pk are still forwarded verbatim.
    expect(send).toHaveBeenCalledWith(TX, PK, expect.any(Function));
  });

  it('initializes the active wallet provider before sending (restored-session guard)', async () => {
    // The SDK's send() crashes ("can't access property status, s is undefined")
    // when this.provider is uninitialized — which happens whenever the account was
    // restored from a persisted session (getActiveAccount populates the account but
    // not the send-provider). The adapter must call getProviderInstance — the SDK's
    // pop-free init primitive — BEFORE send so a restored session can still sign.
    const order: string[] = [];
    const getProviderInstance = vi.fn(async () => {
      order.push('init');
      return {};
    });
    const send = vi.fn(async () => {
      order.push('send');
      return sentResult();
    });
    const adapter = makeClickAdapter(fakeClickRef({ getProviderInstance, send }));

    await adapter.send({ txJson: TX, signerPk: PK });

    expect(getProviderInstance).toHaveBeenCalledWith(CASPER_WALLET_KEY);
    expect(order).toEqual(['init', 'send']);
  });

  it('lowercases the signing public key before calling clickRef.send (SDK contract)', async () => {
    // The CSPR.click SDK requires signingPublicKey to EXACTLY match
    // getActiveAccount().public_key lowercased; otherwise send() rejects without
    // ever popping the wallet. A mixed-case key from the caller must still sign.
    const send = vi.fn(async () => sentResult());
    const adapter = makeClickAdapter(fakeClickRef({ send }));

    await adapter.send({ txJson: TX, signerPk: '01' + 'AB'.repeat(32) });

    expect(send).toHaveBeenCalledWith(TX, PK, expect.any(Function));
  });

  it('normalizes a successful send to the real deployHash (legacy) with a null transactionHash', async () => {
    const adapter = makeClickAdapter(fakeClickRef());

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res).toEqual({
      deployHash: HASH,
      transactionHash: null,
      cancelled: false,
      error: null,
      status: 'sent',
    });
  });

  it('maps deployHash and transactionHash as DISTINCT fields (no cross-fill)', async () => {
    // A Casper 2.0 native transfer resolves as a TransactionV1: the SDK reports
    // transactionHash (canonical) and a null deployHash. The adapter must keep them
    // separate — never copy transactionHash into deployHash — so the view can prefer
    // the canonical hash AND the proof can link /transaction/, not /deploy/.
    const TXH = 'ee'.repeat(32);
    const adapter = makeClickAdapter(
      fakeClickRef({
        send: vi.fn(async () => sentResult({ deployHash: null, transactionHash: TXH })),
      }),
    );

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res.deployHash).toBeNull();
    expect(res.transactionHash).toBe(TXH);
  });

  it('maps a cancelled popup to cancelled=true with no hash and no error', async () => {
    const adapter = makeClickAdapter(
      fakeClickRef({
        send: vi.fn(async () =>
          sentResult({ cancelled: true, deployHash: null, transactionHash: null, status: 'cancelled' }),
        ),
      }),
    );

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res).toEqual({ deployHash: null, transactionHash: null, cancelled: true, error: null, status: 'cancelled' });
  });

  it('surfaces a broadcast error verbatim with no hash', async () => {
    const adapter = makeClickAdapter(
      fakeClickRef({
        send: vi.fn(async () =>
          sentResult({ deployHash: null, transactionHash: null, status: null, error: 'insufficient balance' }),
        ),
      }),
    );

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res.deployHash).toBeNull();
    expect(res.error).toBe('insufficient balance');
  });

  it('treats an undefined SDK result as an honest error, never a silent success', async () => {
    const adapter = makeClickAdapter(
      fakeClickRef({ send: vi.fn(async () => undefined) }),
    );

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res.deployHash).toBeNull();
    expect(res.cancelled).toBe(false);
    expect(res.error).toMatch(/no send result/i);
  });

  it(
    'hands off the moment the status callback delivers a hash, without awaiting the 120s socket',
    async () => {
      const TXH = 'ee'.repeat(32);
      // The real SDK fires the `sent` callback with the broadcast hash the instant
      // the wallet signs, THEN blocks on a CSPR.cloud streaming socket that only
      // settles at finality or a 120s timeout. Our backend verifies finality
      // independently (awaitDeployFinalized polls the node), so the adapter must
      // resolve from the `sent` callback and never await that socket. Model it with
      // a send() promise that NEVER settles: only an early hand-off can resolve.
      const send = vi.fn(
        (_tx: unknown, _pk: string, onStatus?: (s: string, d?: unknown) => void) =>
          new Promise(() => {
            onStatus?.('sent', {
              cancelled: false,
              deployHash: null,
              transactionHash: TXH,
              status: 'sent',
              error: null,
            });
          }),
      );
      const adapter = makeClickAdapter(
        fakeClickRef({ send: send as unknown as ClickRefLike['send'] }),
      );

      const res = await adapter.send({ txJson: TX, signerPk: PK });

      expect(res.transactionHash).toBe(TXH);
      expect(res.deployHash).toBeNull();
      expect(res.cancelled).toBe(false);
      expect(res.status).toBe('sent');
    },
    1500,
  );

  it('does NOT early-resolve on a cancelled callback — settles from the resolved promise', async () => {
    // The SDK fires a cancelled/error callback AND resolves the promise with the
    // same result. The adapter must ignore the hashless cancelled callback (nothing
    // to hand off) and let the promise settle, so a cancelled popup still maps to
    // cancelled=true rather than hanging or mis-resolving.
    const send = vi.fn((_tx: unknown, _pk: string, onStatus?: (s: string, d?: unknown) => void) => {
      onStatus?.('cancelled', {
        cancelled: true,
        deployHash: null,
        transactionHash: null,
        status: 'cancelled',
        error: null,
      });
      return Promise.resolve(
        sentResult({ cancelled: true, deployHash: null, transactionHash: null, status: 'cancelled' }),
      );
    });
    const adapter = makeClickAdapter(
      fakeClickRef({ send: send as unknown as ClickRefLike['send'] }),
    );

    const res = await adapter.send({ txJson: TX, signerPk: PK });

    expect(res).toEqual({
      deployHash: null,
      transactionHash: null,
      cancelled: true,
      error: null,
      status: 'cancelled',
    });
  });
});
