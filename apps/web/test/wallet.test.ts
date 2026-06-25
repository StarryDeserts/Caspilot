import { describe, it, expect, vi } from 'vitest';
import { ClickWallet, type ClickProvider } from '../src/lib/wallet.js';

// The modern CSPR.click SDK exposes a unified `send(txJson, signingPublicKey)` that
// BOTH pops the wallet to sign AND broadcasts via CSPR.click's own node proxy. There
// is no client-side signDeploy and no broadcast through our backend. The seam mirrors
// that: connect() + send({ txJson, signerPk }) → a normalized SendResult. The wallet
// never receives a private key or a CSPR.cloud secret.
const PK = '01' + 'ab'.repeat(32);

describe('ClickWallet', () => {
  it('connects and sends a backend-built tx, returning the real broadcast deployHash', async () => {
    const provider: ClickProvider = {
      connect: vi.fn(async () => ({ publicKey: PK })),
      send: vi.fn(async () => ({
        deployHash: 'dd'.repeat(32),
        transactionHash: null,
        cancelled: false,
        error: null,
        status: 'sent',
      })),
    };
    const w = new ClickWallet(provider);

    const acc = await w.connect();
    expect(acc.publicKey).toBe(PK);

    const res = await w.send({ txJson: { header: {} }, signerPk: PK });
    expect(res.deployHash).toBe('dd'.repeat(32));
    expect(res.cancelled).toBe(false);
    expect(res.error).toBeNull();
    // The signer pubkey is forwarded verbatim so the wallet signs for the right account.
    expect((provider.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      signerPk: PK,
    });
  });

  it('reports a user cancel without a hash (no broadcast happened)', async () => {
    const provider: ClickProvider = {
      connect: vi.fn(async () => ({ publicKey: PK })),
      send: vi.fn(async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: true,
        error: null,
        status: null,
      })),
    };
    const w = new ClickWallet(provider);
    const res = await w.send({ txJson: {}, signerPk: PK });
    expect(res.cancelled).toBe(true);
    expect(res.deployHash).toBeNull();
  });

  it('surfaces a broadcast error without a hash', async () => {
    const provider: ClickProvider = {
      connect: vi.fn(async () => ({ publicKey: PK })),
      send: vi.fn(async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: false,
        error: 'insufficient balance',
        status: 'error',
      })),
    };
    const w = new ClickWallet(provider);
    const res = await w.send({ txJson: {}, signerPk: PK });
    expect(res.error).toBe('insufficient balance');
    expect(res.deployHash).toBeNull();
  });

  it('throws a helpful error when provider is missing', () => {
    expect(() => new ClickWallet(undefined as unknown as ClickProvider)).toThrow(/CSPR\.click/);
  });

  it('refuses a provider that exposes anything resembling CSPR_CLOUD_KEY', () => {
    const provider = {
      connect: async () => ({ publicKey: PK }),
      send: async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: false,
        error: null,
        status: null,
      }),
      CSPR_CLOUD_KEY: 'leaked',
    } as unknown as ClickProvider;
    expect(() => new ClickWallet(provider)).toThrow(/CSPR_CLOUD_KEY/);
  });

  it('refuses a provider that exposes a PRIVATE_KEY field', () => {
    const provider = {
      connect: async () => ({ publicKey: PK }),
      send: async () => ({
        deployHash: null,
        transactionHash: null,
        cancelled: false,
        error: null,
        status: null,
      }),
      PRIVATE_KEY: 'leaked',
    } as unknown as ClickProvider;
    expect(() => new ClickWallet(provider)).toThrow(/PRIVATE_KEY/);
  });
});
