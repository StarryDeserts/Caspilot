import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VaultDetailView, type VaultDetailApi } from '../src/components/VaultDetailView.js';
import type { VaultDetail } from '../src/lib/api.js';

const ID = 'vault_abc123def4567890';

function vault(over: Partial<VaultDetail> = {}): VaultDetail {
  return {
    id: ID,
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
    allowedChainIds: ['casper:casper-test'],
    requireTraceId: false,
    recentDebits: [
      {
        amount: '500',
        status: 'committed',
        intentId: 'int_committed_1',
        traceId: 'trace',
        atMs: Date.now() - 60_000,
      },
    ],
    ...over,
  };
}

function fakeApi(over: Partial<VaultDetailApi> = {}): VaultDetailApi {
  return {
    getVault: vi.fn(async () => vault()),
    ...over,
  };
}

describe('VaultDetailView (client render path)', () => {
  it('renders the scoped policy, spend meter, and recent debits from the loaded vault', async () => {
    const api = fakeApi();
    const { container } = render(<VaultDetailView id={ID} api={api} />);

    // The id is surfaced verbatim in the breadcrumb.
    expect(container.querySelector('.breadcrumb .id')?.textContent).toBe(ID);

    // After getVault resolves, the spend meter renders the day-cap percent —
    // proof the whole detail render path ran from real injected state.
    await screen.findByText('0.8% used');

    // ScopedPolicyLedger facts.
    expect(screen.getByText('cspr-test-cep18')).toBeTruthy();
    expect(screen.getByText(/dev signer/i)).toBeTruthy();
    expect(screen.getByText('casper:casper-test')).toBeTruthy();

    // RecentDebits row (committed badge).
    expect(screen.getByText('committed')).toBeTruthy();

    // getVault was actually invoked with the id.
    expect(api.getVault).toHaveBeenCalledWith(ID);
  });

  it('renders an honest not-found card when getVault 404s, with no panels', async () => {
    const api = fakeApi({
      getVault: vi.fn(async () => {
        throw new Error('getVault 404: no such vault on casper-test');
      }),
    });
    const { container } = render(<VaultDetailView id={ID} api={api} />);

    await screen.findByText(/vault not found/i);
    expect(container.querySelector('.fail-card.notfound')).not.toBeNull();
    expect(screen.queryByText('0.8% used')).toBeNull();
    expect(screen.queryByText('cspr-test-cep18')).toBeNull();
  });

  it('reports a non-404 load failure honestly instead of a blank page', async () => {
    const api = fakeApi({
      getVault: vi.fn(async () => {
        throw new Error('getVault 503: upstream down');
      }),
    });
    const { container } = render(<VaultDetailView id={ID} api={api} />);

    await screen.findByText(/getVault 503/i);
    expect(container.querySelector('.inline-alert.show')).not.toBeNull();
    expect(container.querySelector('.fail-card.notfound')).toBeNull();
  });
});
