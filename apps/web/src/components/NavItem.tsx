import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

export function NavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href as Route}
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {label}
    </Link>
  );
}
