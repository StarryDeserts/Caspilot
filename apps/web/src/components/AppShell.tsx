'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';
import { useWallet } from '../lib/wallet-context.js';
import type { WalletAccountView } from './WalletButton.js';

// Head…tail truncation of the connected pubkey for the wallet chip — enough to
// recognize the account, never the full key.
function walletView(publicKey: string | undefined): WalletAccountView | null {
  if (!publicKey) return null;
  return { ref: `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}` };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const [navOpen, setNavOpen] = useState(false);
  const { account, connect } = useWallet();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="app">
      <Sidebar pathname={pathname} open={navOpen} />
      <Topbar
        account={walletView(account?.publicKey)}
        onMenuToggle={() => setNavOpen((v) => !v)}
        onWalletClick={() => {
          // A cancelled connect popup is a benign no-op, not an error to surface.
          void connect().catch(() => {});
        }}
      />
      <main className="content">{children}</main>
    </div>
  );
}
