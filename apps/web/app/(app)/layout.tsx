import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell.js';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
