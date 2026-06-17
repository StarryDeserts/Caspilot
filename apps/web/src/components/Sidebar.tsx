import type { ReactNode } from 'react';
import { CaspilotMark } from './CaspilotMark.js';
import { NavItem } from './NavItem.js';

interface NavEntry {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV: NavEntry[] = [
  {
    href: '/console',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/intents',
    label: 'Intents',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: '/vaults',
    label: 'Vaults',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M16 14h2" />
      </svg>
    ),
  },
  {
    href: '/developers',
    label: 'Developers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}>
        <path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ pathname, open = false }: { pathname: string; open?: boolean }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand">
        <div className="wordmark">
          <CaspilotMark size={22} />
          Caspilot
        </div>
        <div className="tagline">autonomy you can audit</div>
      </div>
      <nav className="nav">
        {NAV.map((entry) => (
          <NavItem
            key={entry.href}
            href={entry.href}
            label={entry.label}
            icon={entry.icon}
            active={isActive(pathname, entry.href)}
          />
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="env-label">
          <span className="net-dot" />
          casper:casper-test
        </div>
        <div className="build-chip">build dev</div>
      </div>
    </aside>
  );
}
