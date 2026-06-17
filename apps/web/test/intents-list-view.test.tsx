import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { IntentsListView, type IntentsListApi } from '../src/components/IntentsListView.js';
import type { IntentSummary } from '../src/lib/api.js';

const NOW = 2_000_000_000_000;

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

const SEED: IntentSummary[] = [
  intent({ id: 'int_exec_1', state: 'EXECUTED', updatedAtMs: NOW - 600_000 }),
  intent({ id: 'int_draft_1', state: 'DRAFT', updatedAtMs: NOW - 5_000 }),
  intent({ id: 'int_rej_1', state: 'REJECTED', updatedAtMs: NOW - 3_600_000 }),
  intent({ id: 'int_val_1', state: 'POLICY_VALIDATED', updatedAtMs: NOW - 60_000 }),
  intent({ id: 'int_pay_1', state: 'PAYMENT_REQUIRED', updatedAtMs: NOW - 120_000 }),
];

function fakeApi(over: Partial<IntentsListApi> = {}): IntentsListApi {
  return {
    listIntents: vi.fn(async () => SEED),
    createIntent: vi.fn(async () => ({ id: 'int_new_one', state: 'DRAFT' })),
    ...over,
  };
}

function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody tr[role="button"]')).map(
    (r) => r.getAttribute('aria-label')?.split(' · ')[0] ?? '',
  );
}

async function renderLoaded(over: Partial<IntentsListApi> = {}, onOpen = vi.fn()) {
  const api = fakeApi(over);
  const utils = render(<IntentsListView api={api} onOpen={onOpen} now={NOW} />);
  await screen.findByText('int_draft_1');
  return { ...utils, api, onOpen };
}

describe('IntentsListView (client render path)', () => {
  it('loads intents newest-first and shows per-segment counts', async () => {
    const { container } = await renderLoaded();
    expect(rowIds(container)).toEqual([
      'int_draft_1',
      'int_val_1',
      'int_pay_1',
      'int_exec_1',
      'int_rej_1',
    ]);
    // segment counts: All 5, Draft 1, Validated 1, Executed 1, Rejected 1
    expect(screen.getByRole('tab', { name: /all/i }).textContent).toMatch(/5/);
    expect(screen.getByRole('tab', { name: /draft/i }).textContent).toMatch(/1/);
  });

  it('filters to a single segment, hiding in-flight intents from named buckets', async () => {
    const { container } = await renderLoaded();
    fireEvent.click(screen.getByRole('tab', { name: /draft/i }));
    expect(rowIds(container)).toEqual(['int_draft_1']);

    // PAYMENT_REQUIRED is in-flight: it appears under All but no named segment
    fireEvent.click(screen.getByRole('tab', { name: /executed/i }));
    expect(rowIds(container)).toEqual(['int_exec_1']);
  });

  it('searches by id', async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByPlaceholderText(/search id or agent/i), {
      target: { value: 'val_1' },
    });
    expect(rowIds(container)).toEqual(['int_val_1']);
  });

  it('opens an intent when its row is activated', async () => {
    const onOpen = vi.fn();
    await renderLoaded({}, onOpen);
    fireEvent.click(screen.getByRole('button', { name: /int_exec_1/ }));
    expect(onOpen).toHaveBeenCalledWith('int_exec_1');
  });

  it('shows an empty state with a New-intent affordance when there are no intents', async () => {
    const api = fakeApi({ listIntents: vi.fn(async () => []) });
    const { container } = render(<IntentsListView api={api} onOpen={vi.fn()} now={NOW} />);
    await screen.findByText(/no intents yet/i);
    expect(container.querySelector('tbody tr[role="button"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: /new intent/i }).length).toBeGreaterThan(0);
  });

  it('creates an intent: optimistic prepend + toast + navigate', async () => {
    const onOpen = vi.fn();
    const { container, api } = await renderLoaded({}, onOpen);

    fireEvent.click(screen.getByRole('button', { name: /new intent/i }));
    const set = (id: string, v: string) =>
      fireEvent.change(container.querySelector<HTMLInputElement>(`#${id}`)!, {
        target: { value: v },
      });
    set('agent', `00${'a'.repeat(64)}`);
    set('receiver', `00${'b'.repeat(64)}`);
    set('contract', `00${'c'.repeat(64)}`);
    set('token', 'cspr-test-cep18');
    set('amount', '750');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    });

    expect(api.createIntent).toHaveBeenCalledWith({
      agent: `00${'a'.repeat(64)}`,
      receiver: `00${'b'.repeat(64)}`,
      contract: `00${'c'.repeat(64)}`,
      token: 'cspr-test-cep18',
      network: 'casper:casper-test',
      amount: '750',
    });
    // optimistic prepend: the new id leads the table
    await waitFor(() => expect(rowIds(container)[0]).toBe('int_new_one'));
    expect(screen.getByText(/intent created/i)).toBeTruthy();
    expect(onOpen).toHaveBeenCalledWith('int_new_one');
  });

  it('reports a load failure honestly instead of a blank table', async () => {
    const api = fakeApi({
      listIntents: vi.fn(async () => {
        throw new Error('listIntents 503: upstream down');
      }),
    });
    const { container } = render(<IntentsListView api={api} onOpen={vi.fn()} now={NOW} />);
    await screen.findByText(/listIntents 503/i);
    expect(container.querySelector('.inline-alert.show')).not.toBeNull();
  });
});
