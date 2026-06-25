import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentsTable } from '../src/components/IntentsTable.js';
import type { IntentSummary } from '../src/lib/api.js';

const NOW = 2_000_000_000_000;

function intent(over: Partial<IntentSummary> = {}): IntentSummary {
  return {
    id: 'int_3hdp2enXXXX',
    state: 'POLICY_VALIDATED',
    agent: '00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    receiver: '00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    token: 'cspr-test-cep18',
    contract: '00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    network: 'casper:casper-test',
    amount: '1200',
    updatedAtMs: NOW - 40_000,
    ...over,
  };
}

describe('IntentsTable', () => {
  it('renders a row per intent with truncated id, grouped amount, badge and relative time', () => {
    render(<IntentsTable intents={[intent()]} nowMs={NOW} onOpen={() => {}} />);

    expect(screen.getByText('int_3hdp2en…')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('POLICY_VALIDATED')).toBeTruthy();
    expect(screen.getByText('40s ago')).toBeTruthy();
    // account hashes are shown in short form, never in full
    expect(screen.getByText('00aa…')).toBeTruthy();
    expect(screen.queryByText(intent().agent)).toBeNull();
  });

  it('exposes a right-aligned Amount header', () => {
    const { container } = render(
      <IntentsTable intents={[intent()]} nowMs={NOW} onOpen={() => {}} />,
    );
    const amountHeader = Array.from(container.querySelectorAll('th')).find(
      (th) => th.textContent === 'Amount',
    );
    expect(amountHeader?.className).toContain('num');
  });

  it('navigates on full-row click', () => {
    const onOpen = vi.fn();
    render(
      <IntentsTable intents={[intent({ id: 'int_click_me_1' })]} nowMs={NOW} onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /int_click_me_1/ }));
    expect(onOpen).toHaveBeenCalledWith('int_click_me_1');
  });

  it('navigates on Enter and on Space (keyboard accessible row)', () => {
    const onOpen = vi.fn();
    render(
      <IntentsTable intents={[intent({ id: 'int_keynav_99' })]} nowMs={NOW} onOpen={onOpen} />,
    );
    const row = screen.getByRole('button', { name: /int_keynav_99/ });

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('int_keynav_99');

    fireEvent.keyDown(row, { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('ignores unrelated keys', () => {
    const onOpen = vi.fn();
    render(<IntentsTable intents={[intent({ id: 'int_x' })]} nowMs={NOW} onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /int_x/ }), { key: 'a' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('makes every row focusable', () => {
    render(
      <IntentsTable
        intents={[intent({ id: 'int_a' }), intent({ id: 'int_b' })]}
        nowMs={NOW}
        onOpen={() => {}}
      />,
    );
    for (const r of screen.getAllByRole('button')) {
      expect(r.getAttribute('tabindex')).toBe('0');
    }
  });
});
