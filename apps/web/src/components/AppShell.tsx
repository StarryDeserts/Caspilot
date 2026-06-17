'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="app">
      <Sidebar pathname={pathname} open={navOpen} />
      <Topbar onMenuToggle={() => setNavOpen((v) => !v)} />
      <main className="content">{children}</main>
    </div>
  );
}
