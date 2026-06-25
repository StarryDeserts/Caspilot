import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../src/components/Button.js';
import { NetworkPill } from '../src/components/NetworkPill.js';
import { HealthDot } from '../src/components/HealthDot.js';
import { WalletButton } from '../src/components/WalletButton.js';
import { Tooltip } from '../src/components/Tooltip.js';

describe('Button', () => {
  it('renders a primary button by default', () => {
    const { container } = render(<Button>Authorize &amp; sign</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('btn');
    expect(btn?.className).toContain('btn-primary');
    expect(btn?.textContent).toContain('Authorize');
  });

  it('applies ghost and danger variants', () => {
    const { container: g } = render(<Button variant="ghost">Cancel</Button>);
    expect(g.querySelector('button')?.className).toContain('btn-ghost');
    const { container: d } = render(<Button variant="danger">Reject</Button>);
    expect(d.querySelector('button')?.className).toContain('btn-danger');
  });

  it('shows a spinner and disables itself while loading', () => {
    const { container } = render(<Button loading>Signing…</Button>);
    const btn = container.querySelector('button');
    expect(container.querySelector('.spinner')).not.toBeNull();
    expect(btn?.className).toContain('is-loading');
    expect(btn?.disabled).toBe(true);
  });

  it('does not fire onClick while loading', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Signing…
      </Button>,
    );
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('NetworkPill', () => {
  it('renders the network id with a status dot', () => {
    const { container } = render(<NetworkPill network="casper:casper-test" />);
    const pill = container.querySelector('.network-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('casper:casper-test');
    expect(container.querySelector('.pill-dot')).not.toBeNull();
  });
});

describe('HealthDot', () => {
  it.each(['healthy', 'degraded', 'down'])(
    'reflects %s status as a class + accessible name',
    (status) => {
      const { container } = render(<HealthDot status={status as never} />);
      const dot = container.querySelector('.health-dot');
      expect(dot?.className).toContain(status);
      expect(container.querySelector('.dot')).not.toBeNull();
      expect(screen.getByRole('status').getAttribute('aria-label')).toContain(status);
    },
  );
});

describe('WalletButton', () => {
  it('shows the connect call-to-action when no account is present', () => {
    const { container } = render(<WalletButton />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('idle');
    expect(btn?.textContent).toMatch(/connect cspr\.click/i);
  });

  it('shows the truncated account ref when connected', () => {
    const { container } = render(<WalletButton account={{ ref: '01a2…9f' }} />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('connected');
    expect(btn?.textContent).toContain('01a2…9f');
    expect(container.querySelector('.key-dot')).not.toBeNull();
    expect(container.querySelector('.caret')).not.toBeNull();
  });

  it('invokes onClick when pressed', () => {
    const onClick = vi.fn();
    render(<WalletButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Tooltip', () => {
  it('wraps its trigger and exposes the tip label', () => {
    const { container } = render(
      <Tooltip label="Testnet only">
        <span>trigger</span>
      </Tooltip>,
    );
    expect(container.querySelector('.tooltip-wrap')).not.toBeNull();
    expect(container.textContent).toContain('trigger');
    const tip = container.querySelector('.tip');
    expect(tip?.textContent).toContain('Testnet only');
  });
});
