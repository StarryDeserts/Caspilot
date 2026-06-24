import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WalletProvider, useWallet } from '../src/lib/wallet-context.js';
import type { ClickProvider } from '../src/lib/wallet.js';

const PK = '01' + 'ab'.repeat(32);

function makeProvider(over: Partial<ClickProvider> = {}): ClickProvider {
  return {
    connect: vi.fn(async () => ({ publicKey: PK })),
    send: vi.fn(async () => ({
      deployHash: 'dd'.repeat(32),
      transactionHash: null,
      cancelled: false,
      error: null,
      status: 'sent',
    })),
    ...over,
  };
}

function wrapperFor(provider: ClickProvider) {
  return ({ children }: { children: ReactNode }) => (
    <WalletProvider provider={provider}>{children}</WalletProvider>
  );
}

describe('useWallet / WalletProvider', () => {
  it('throws a helpful error when used outside a WalletProvider', () => {
    expect(() => renderHook(() => useWallet())).toThrow(/WalletProvider/);
  });

  it('starts disconnected (no account)', () => {
    const { result } = renderHook(() => useWallet(), { wrapper: wrapperFor(makeProvider()) });
    expect(result.current.account).toBeNull();
  });

  it('connect() pops the wallet and stores the active account', async () => {
    const provider = makeProvider();
    const { result } = renderHook(() => useWallet(), { wrapper: wrapperFor(provider) });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.account?.publicKey).toBe(PK);
    expect(provider.connect).toHaveBeenCalledTimes(1);
  });

  it('signAndSubmit forwards the connected account as signerPk and returns the hash', async () => {
    const provider = makeProvider();
    const { result } = renderHook(() => useWallet(), { wrapper: wrapperFor(provider) });
    await act(async () => {
      await result.current.connect();
    });

    let res: Awaited<ReturnType<typeof result.current.signAndSubmit>> | undefined;
    await act(async () => {
      res = await result.current.signAndSubmit({ header: {} });
    });

    expect(res?.deployHash).toBe('dd'.repeat(32));
    expect(provider.send).toHaveBeenCalledWith({ txJson: { header: {} }, signerPk: PK });
  });

  it('signAndSubmit refuses to sign before a wallet is connected', async () => {
    const provider = makeProvider();
    const { result } = renderHook(() => useWallet(), { wrapper: wrapperFor(provider) });
    await expect(result.current.signAndSubmit({})).rejects.toThrow(/connect/i);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('refuses to mount a provider that leaks a CSPR_CLOUD_KEY', () => {
    const leaky = {
      connect: async () => ({ publicKey: PK }),
      send: async () => ({ deployHash: null, cancelled: false, error: null, status: null }),
      CSPR_CLOUD_KEY: 'leaked',
    } as unknown as ClickProvider;
    expect(() => renderHook(() => useWallet(), { wrapper: wrapperFor(leaky) })).toThrow(
      /CSPR_CLOUD_KEY/,
    );
  });
});
