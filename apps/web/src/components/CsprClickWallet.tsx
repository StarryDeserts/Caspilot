'use client';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { WalletProvider } from '../lib/wallet-context.js';
import type { ClickProvider as ClickProviderSeam } from '../lib/wallet.js';

// SSR-safe entry point for wallet support. The whole app group renders under this,
// and both AppShell and the intent page call useWallet(), so a WalletProvider must
// exist during SSR and on every client render. The real CSPR.click SDK touches
// `window`, so it is imported ONLY in the browser, ONLY after mount, and ONLY when a
// public app id is configured — until then an offline provider keeps useWallet()
// resolvable while honestly reporting that signing isn't available yet.

const APP_ID = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID ?? '';

type LiveComp = ComponentType<{ children: ReactNode }>;

// Stand-in provider used during SSR/first paint, while the SDK chunk loads, and
// whenever no app id is set. connect()/send() reject with a clear reason rather than
// pretending to work; AppShell already swallows a rejected connect as a benign no-op.
function offlineProvider(configured: boolean): ClickProviderSeam {
  const why = configured
    ? 'CSPR.click is still initializing — try again in a moment'
    : 'CSPR.click wallet is not configured — set NEXT_PUBLIC_CSPRCLICK_APP_ID to enable signing';
  return {
    connect: () => Promise.reject(new Error(why)),
    send: () => Promise.reject(new Error(why)),
  };
}

export function CsprClickWallet({ children }: { children: ReactNode }) {
  const [Live, setLive] = useState<LiveComp | null>(null);

  useEffect(() => {
    if (!APP_ID) return;
    let alive = true;
    // Browser-only dynamic import: the SDK-bearing module never loads on the server.
    // We flip to the live provider only AFTER the chunk resolves, so children stay
    // mounted under the offline provider until then — no blank flash on swap.
    import('./LiveClickProvider.js')
      .then((m) => {
        if (alive) setLive(() => m.LiveClickProvider as LiveComp);
      })
      .catch(() => {
        /* leave the offline provider in place; connect() reports the failure honestly */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (Live) {
    return <Live>{children}</Live>;
  }
  return <WalletProvider provider={offlineProvider(Boolean(APP_ID))}>{children}</WalletProvider>;
}
