import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

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
import { WalletProvider } from '../src/lib/wallet-context.js';
import type { ClickProvider } from '../src/lib/wallet.js';

const PK = '01' + 'ab'.repeat(32);

function fakeProvider(over: Partial<ClickProvider> = {}): ClickProvider {
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

// AppShell calls useWallet(), so it must render inside a WalletProvider — the same
// way the real app group layout mounts it. Tests inject a fake ClickProvider.
function renderShell(ui: ReactNode, provider: ClickProvider = fakeProvider()) {
  return render((<WalletProvider provider={provider}>{ui}</WalletProvider>) as ReactElement);
}

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
    const { container } = renderShell(
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
    const { container } = renderShell(<AppShell>x</AppShell>);
    const active = container.querySelectorAll('a.nav-item.active');
    expect(active.length).toBe(1);
    expect(active[0]?.textContent).toContain('Vaults');
  });

  it('opens the mobile drawer when the hamburger is clicked', () => {
    mockPathname = '/console';
    const { container } = renderShell(<AppShell>x</AppShell>);
    expect(container.querySelector('aside.sidebar')?.className).not.toContain('open');
    fireEvent.click(container.querySelector('.menu-toggle')!);
    expect(container.querySelector('aside.sidebar')?.className).toContain('open');
  });

  it('closes the mobile drawer when the route changes', () => {
    mockPathname = '/console';
    const provider = fakeProvider();
    const { container, rerender } = render(
      <WalletProvider provider={provider}>
        <AppShell>x</AppShell>
      </WalletProvider>,
    );
    fireEvent.click(container.querySelector('.menu-toggle')!);
    expect(container.querySelector('aside.sidebar')?.className).toContain('open');
    mockPathname = '/vaults';
    rerender(
      <WalletProvider provider={provider}>
        <AppShell>x</AppShell>
      </WalletProvider>,
    );
    expect(container.querySelector('aside.sidebar')?.className).not.toContain('open');
  });

  it('starts with the idle (unconnected) wallet button', () => {
    mockPathname = '/console';
    const { container } = renderShell(<AppShell>x</AppShell>);
    expect(container.querySelector('.wallet-btn.idle')).not.toBeNull();
    expect(container.querySelector('.wallet-btn.connected')).toBeNull();
  });

  it('wires the wallet button to connect(), then shows the connected account', async () => {
    mockPathname = '/console';
    const provider = fakeProvider();
    const { container } = renderShell(<AppShell>x</AppShell>, provider);

    fireEvent.click(container.querySelector('.wallet-btn.idle')!);

    await waitFor(() => {
      expect(container.querySelector('.wallet-btn.connected')).not.toBeNull();
    });
    expect(provider.connect).toHaveBeenCalledTimes(1);
    // The connected button shows a truncation of the real pubkey (head…tail), never
    // the full key — and certainly never a secret.
    const btnText = container.querySelector('.wallet-btn.connected')?.textContent ?? '';
    expect(btnText).toContain('…');
    expect(btnText).toContain(PK.slice(0, 6));
    expect(btnText).not.toContain(PK); // not the full key
  });
});
