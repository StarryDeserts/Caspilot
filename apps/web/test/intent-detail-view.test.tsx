import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { IntentDetailView, type IntentDetailApi } from '../src/components/IntentDetailView.js';
import type { TraceEntry } from '../src/lib/api.js';

const ID = 'int_smoke_1';

// The exact shape the live API emits for a freshly-created DRAFT intent: a single
// `created` row whose payload.body carries the proposed transfer. This is the
// contract the page's client render path depends on end to end.
function draftTrace(): { entries: TraceEntry[] } {
  return {
    entries: [
      {
        intentId: ID,
        state: 'DRAFT',
        atMs: 1_781_595_003_984,
        kind: 'created',
        payload: {
          body: {
            agent: 'agent-alpha',
            receiver: '01'.repeat(32),
            token: 'USDC',
            contract: 'cep18-usdc',
            network: 'casper-test',
            amount: '25.00',
          },
        },
        redacted: false,
      },
    ],
  };
}

function fakeApi(over: Partial<IntentDetailApi> = {}): IntentDetailApi {
  return {
    getTrace: vi.fn(async () => draftTrace()),
    validatePolicy: vi.fn(async () => ({ id: ID, state: 'POLICY_VALIDATED' })),
    markExecuted: vi.fn(async (_id: string, deployHash: string) => ({
      id: ID,
      state: 'EXECUTED',
      deployHash,
    })),
    reject: vi.fn(async () => ({ id: ID, state: 'REJECTED' })),
    ...over,
  };
}

describe('IntentDetailView (client render path)', () => {
  it('renders the populated DRAFT page from a live-shaped trace and wires the validate action', async () => {
    const api = fakeApi();
    const { container } = render(<IntentDetailView id={ID} api={api} />);

    // The id is surfaced verbatim in the breadcrumb.
    expect(container.querySelector('.breadcrumb .id')?.textContent).toBe(ID);

    // After the hook's first getTrace resolves, the header badge shows DRAFT (lg).
    const badge = await waitFor(() => {
      const el = container.querySelector('.badge.lg');
      if (!el || !/DRAFT/.test(el.textContent ?? '')) throw new Error('not yet');
      return el;
    });
    expect(badge.textContent).toMatch(/DRAFT/);

    // The proposed-intent panel reflects the body from payload.body.
    expect(screen.getByText('agent-alpha')).toBeTruthy();
    expect(screen.getByText('25.00')).toBeTruthy();

    // DRAFT gating: the one offered action is Validate policy; clicking it calls
    // the injected client with the intent id.
    const validate = screen.getByRole('button', { name: /validate policy/i });
    await act(async () => {
      fireEvent.click(validate);
    });
    expect(api.validatePolicy).toHaveBeenCalledWith(ID);

    // getTrace was actually invoked with the id (the hook is live).
    expect(api.getTrace).toHaveBeenCalledWith(ID);
  });

  it('renders an honest not-found card when getTrace 404s, with no write actions', async () => {
    const api = fakeApi({
      getTrace: vi.fn(async () => {
        throw new Error('getTrace 404: no such intent');
      }),
    });
    const { container } = render(<IntentDetailView id={ID} api={api} />);

    await screen.findByText(/intent not found/i);
    expect(container.querySelector('.fail-card.notfound')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /validate policy/i })).toBeNull();
    expect(container.querySelector('.badge.lg')).toBeNull();
  });
});
