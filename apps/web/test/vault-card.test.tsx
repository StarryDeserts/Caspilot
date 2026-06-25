import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultCard } from '../src/components/VaultCard.js';
import type { VaultSummary } from '../src/lib/api.js';

function vault(over: Partial<VaultSummary> = {}): VaultSummary {
  return {
    id: 'vault_abc123def4567890',
    signerRole: 'local_dev',
    token: 'cspr-test-cep18',
    contract: `00${'c'.repeat(64)}`,
    receiverPolicy: 'allowlist',
    allowedReceivers: [`00${'b'.repeat(64)}`],
    maxSinglePaymentAtomic: '500',
    perDayCapAtomic: '100000',
    usedTodayAtomic: '800',
    dayUtc: '2026-06-17',
    policyDigest: 'a1b2c3'.repeat(8),
    ...over,
  };
}

describe('VaultCard', () => {
  it('shows the vault id, token, and daily-cap meter with used/cap and pct', () => {
    render(<VaultCard vault={vault()} onOpen={vi.fn()} />);
    expect(screen.getByText('vault_abc123def4567890')).toBeTruthy();
    expect(screen.getByText('cspr-test-cep18')).toBeTruthy();
    // 800 / 100000 = 0.8% — sub-1% stays visible (1-decimal meter precision)
    expect(screen.getByText('0.8%')).toBeTruthy();
    expect(screen.getByText('800')).toBeTruthy();
    expect(screen.getByText('100,000')).toBeTruthy();
  });

  it('colors the meter ok well below the cap and sizes the fill to the pct', () => {
    const { container } = render(
      <VaultCard vault={vault({ usedTodayAtomic: '800' })} onOpen={vi.fn()} />,
    );
    const fill = container.querySelector<HTMLElement>('.meter-fill');
    expect(fill).not.toBeNull();
    expect(fill?.classList.contains('ok')).toBe(true);
    expect(fill?.style.width).toBe('0.8%');
  });

  it('warns near the cap (>=80%) with a note and warn color', () => {
    const { container } = render(
      <VaultCard vault={vault({ usedTodayAtomic: '85000' })} onOpen={vi.fn()} />,
    );
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText(/near day cap/i)).toBeTruthy();
    expect(container.querySelector('.meter-fill')?.classList.contains('warn')).toBe(true);
  });

  it('flags crit at >=90%', () => {
    const { container } = render(
      <VaultCard vault={vault({ usedTodayAtomic: '95000' })} onOpen={vi.fn()} />,
    );
    expect(screen.getByText('95%')).toBeTruthy();
    expect(container.querySelector('.meter-fill')?.classList.contains('crit')).toBe(true);
  });

  it('does not render a near-cap note when usage is low', () => {
    render(<VaultCard vault={vault({ usedTodayAtomic: '800' })} onOpen={vi.fn()} />);
    expect(screen.queryByText(/near day cap/i)).toBeNull();
  });

  it('opens the vault on click and on keyboard activation', () => {
    const onOpen = vi.fn();
    render(<VaultCard vault={vault()} onOpen={onOpen} />);
    const card = screen.getByRole('button', { name: /vault_abc123def4567890/ });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('vault_abc123def4567890');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
