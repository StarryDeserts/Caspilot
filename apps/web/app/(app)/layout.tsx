import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell.js';
import { CsprClickWallet } from '@/components/CsprClickWallet.js';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <CsprClickWallet>
      <AppShell>{children}</AppShell>
    </CsprClickWallet>
  );
}
