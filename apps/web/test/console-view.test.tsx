import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ConsoleView, type ConsoleApi } from '../src/components/ConsoleView.js';
import type { IntentSummary } from '../src/lib/api.js';

const NOW = 2_000_000_000_000;
const DAY = 86_400_000;

function intent(over: Partial<IntentSummary> & Pick<IntentSummary, 'id' | 'state'>): IntentSummary {
  return {
    agent: `00${'a'.repeat(64)}`,
    receiver: `00${'b'.repeat(64)}`,
    token: 'cspr-test-cep18',
    contract: `00${'c'.repeat(64)}`,
    network: 'casper:casper-test',
    amount: '500',
    updatedAtMs: NOW,
    ...over,
  };
}

// active=3 (DRAFT, POLICY_VALIDATED, PAYMENT_REQUIRED), awaitingPolicy=1 (DRAFT),
// executedToday=2 (EXECUTED+FINALIZED today; the old EXECUTED is excluded),
// rejectedToday=1 (REJECTED today; the old TIMEOUT is excluded).
const SEED: IntentSummary[] = [
  intent({ id: 'int_e1', state: 'EXECUTED', updatedAtMs: NOW - 1_000 }),
  intent({ id: 'int_f1', state: 'FINALIZED', updatedAtMs: NOW - 2_000 }),
  intent({ id: 'int_eold', state: 'EXECUTED', updatedAtMs: NOW - 2 * DAY }),
  intent({ id: 'int_d1', state: 'DRAFT', updatedAtMs: NOW - 3_000 }),
  intent({ id: 'int_v1', state: 'POLICY_VALIDATED', updatedAtMs: NOW - 4_000 }),
  intent({ id: 'int_pr1', state: 'PAYMENT_REQUIRED', updatedAtMs: NOW - 5_000 }),
  intent({ id: 'int_rej1', state: 'REJECTED', updatedAtMs: NOW - 6_000 }),
  intent({ id: 'int_told', state: 'TIMEOUT', updatedAtMs: NOW - 2 * DAY - 1 }),
];

function fakeApi(over: Partial<ConsoleApi> = {}): ConsoleApi {
  return { listIntents: vi.fn(async () => SEED), ...over };
}

function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr[role="button"]')).map(
    (r) => r.getAttribute('aria-label')?.split(' · ')[0] ?? '',
  );
}

function statValue(label: string): string {
  const tile = screen.getByText(label).closest('.stat') as HTMLElement;
  return tile.querySelector('.snum')?.textContent ?? '';
}

async function renderLoaded(
  over: Partial<ConsoleApi> = {},
  handlers: Partial<{ onOpen: () => void; onViewAll: () => void }> = {},
) {
  const api = fakeApi(over);
  const onOpen = handlers.onOpen ?? vi.fn();
  const onViewAll = handlers.onViewAll ?? vi.fn();
  const utils = render(<ConsoleView api={api} onOpen={onOpen} onViewAll={onViewAll} now={NOW} />);
  await screen.findByText('int_e1');
  return { ...utils, api, onOpen, onViewAll };
}

describe('ConsoleView (client render path)', () => {
  it('renders the four honest status counts from listIntents', async () => {
    await renderLoaded();
    expect(statValue('Active intents')).toBe('3');
    expect(statValue('Awaiting policy')).toBe('1');
    expect(statValue('Executed today')).toBe('2');
    expect(statValue('Rejected today')).toBe('1');
  });

  it('shows only the five newest intents in Recent, newest-first', async () => {
    const { container } = await renderLoaded();
    expect(rowIds(container)).toEqual(['int_e1', 'int_f1', 'int_d1', 'int_v1', 'int_pr1']);
  });

  it('opens an intent when its row is activated', async () => {
    const onOpen = vi.fn();
    await renderLoaded({}, { onOpen });
    fireEvent.click(screen.getByRole('button', { name: /int_e1/ }));
    expect(onOpen).toHaveBeenCalledWith('int_e1');
  });

  it('navigates to the full list from the View all control', async () => {
    const onViewAll = vi.fn();
    await renderLoaded({}, { onViewAll });
    fireEvent.click(screen.getByRole('button', { name: /view all/i }));
    expect(onViewAll).toHaveBeenCalled();
  });

  it('renders the security guarantees footer', async () => {
    await renderLoaded();
    expect(screen.getByText(/signer separation/i)).toBeTruthy();
    expect(screen.getByText(/redacted trace/i)).toBeTruthy();
    expect(screen.getByText(/no keys in browser/i)).toBeTruthy();
  });

  it('shows an empty state with a New-intent affordance when there are no intents', async () => {
    const api = fakeApi({ listIntents: vi.fn(async () => []) });
    const onViewAll = vi.fn();
    const { container } = render(
      <ConsoleView api={api} onOpen={vi.fn()} onViewAll={onViewAll} now={NOW} />,
    );
    await screen.findByText(/no intents yet/i);
    expect(container.querySelector('tbody tr[role="button"]')).toBeNull();
    // counts honestly read zero
    expect(statValue('Active intents')).toBe('0');
    const newBtn = within(container.querySelector('.empty') as HTMLElement).getByRole('button', {
      name: /new intent/i,
    });
    fireEvent.click(newBtn);
    expect(onViewAll).toHaveBeenCalled();
  });

  it('reports a load failure honestly instead of a blank dashboard', async () => {
    const api = fakeApi({
      listIntents: vi.fn(async () => {
        throw new Error('listIntents 503: upstream down');
      }),
    });
    const { container } = render(
      <ConsoleView api={api} onOpen={vi.fn()} onViewAll={vi.fn()} now={NOW} />,
    );
    await screen.findByText(/listIntents 503/i);
    expect(container.querySelector('.inline-alert.show')).not.toBeNull();
  });
});
