import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let mockPathname = '/console';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { Topbar } from '../src/components/Topbar.js';
import { AppShell } from '../src/components/AppShell.js';

describe('Topbar', () => {
  it('renders network pill, health dot, and idle wallet button by default', () => {
    const { container } = render(<Topbar />);
    expect(container.querySelector('.network-pill')).not.toBeNull();
    expect(container.querySelector('.health-dot')).not.toBeNull();
    expect(container.querySelector('.wallet-btn.idle')).not.toBeNull();
  });

  it('fires onMenuToggle when the hamburger is clicked', () => {
    const onMenuToggle = vi.fn();
    const { container } = render(<Topbar onMenuToggle={onMenuToggle} />);
    fireEvent.click(container.querySelector('.menu-toggle')!);
    expect(onMenuToggle).toHaveBeenCalledOnce();
  });

  it('renders the connected wallet when an account is supplied', () => {
    const { container } = render(<Topbar account={{ ref: '01a2…9f' }} />);
    expect(container.querySelector('.wallet-btn.connected')).not.toBeNull();
    expect(container.textContent).toContain('01a2…9f');
  });
});

describe('AppShell', () => {
  it('renders children inside the content region', () => {
    mockPathname = '/console';
    const { container } = render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );
    const content = container.querySelector('main.content');
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain('page body');
  });

  it('derives the active nav item from the pathname', () => {
    mockPathname = '/vaults';
    const { container } = render(<AppShell>x</AppShell>);
    const active = container.querySelectorAll('a.nav-item.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Vaults');
  });

  it('opens the mobile drawer when the hamburger is clicked', () => {
    mockPathname = '/console';
    const { container } = render(<AppShell>x</AppShell>);
    expect(container.querySelector('aside.sidebar')?.className).not.toContain('open');
    fireEvent.click(container.querySelector('.menu-toggle')!);
    expect(container.querySelector('aside.sidebar')?.className).toContain('open');
  });

  it('closes the mobile drawer when the route changes', () => {
    mockPathname = '/console';
    const { container, rerender } = render(<AppShell>x</AppShell>);
    fireEvent.click(container.querySelector('.menu-toggle')!);
    expect(container.querySelector('aside.sidebar')?.className).toContain('open');
    mockPathname = '/vaults';
    rerender(<AppShell>x</AppShell>);
    expect(container.querySelector('aside.sidebar')?.className).not.toContain('open');
  });
});
