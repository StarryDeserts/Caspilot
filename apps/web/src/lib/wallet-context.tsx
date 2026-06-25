'use client';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ClickWallet,
  type ClickAccount,
  type ClickProvider,
  type ClickSendResult,
} from './wallet.js';

export interface WalletContextValue {
  account: ClickAccount | null;
  connect(): Promise<ClickAccount>;
  signAndSubmit(txJson: object): Promise<ClickSendResult>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  provider,
  children,
}: {
  provider: ClickProvider;
  children: ReactNode;
}) {
  // Construct the guarded wallet once. ClickWallet's constructor throws if the
  // provider leaks a CSPR.cloud/private-key field — surfacing that at mount is the
  // honest failure mode (better a loud crash than a silently compromised frontend).
  const walletRef = useRef<ClickWallet | null>(null);
  if (walletRef.current === null) {
    walletRef.current = new ClickWallet(provider);
  }
  const wallet = walletRef.current;

  const [account, setAccount] = useState<ClickAccount | null>(null);

  const value = useMemo<WalletContextValue>(
    () => ({
      account,
      async connect() {
        const acc = await wallet.connect();
        setAccount(acc);
        return acc;
      },
      async signAndSubmit(txJson: object) {
        if (!account) {
          throw new Error('connect a wallet before signing — no active account');
        }
        return wallet.send({ txJson, signerPk: account.publicKey });
      },
    }),
    [account, wallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}
