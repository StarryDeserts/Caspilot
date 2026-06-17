import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultsListView, type VaultsListApi } from '../src/components/VaultsListView.js';
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

function fakeApi(over: Partial<VaultsListApi> = {}): VaultsListApi {
  return {
    listVaults: vi.fn(async () => [vault()]),
    ...over,
  };
}

describe('VaultsListView (client render path)', () => {
  it('loads and renders the live vault as a card', async () => {
    render(<VaultsListView api={fakeApi()} onOpen={vi.fn()} />);
    await screen.findByText('vault_abc123def4567890');
    expect(screen.getByText('cspr-test-cep18')).toBeTruthy();
    expect(screen.getByText('0.8%')).toBeTruthy();
  });

  it('opens a vault when its card is activated', async () => {
    const onOpen = vi.fn();
    render(<VaultsListView api={fakeApi()} onOpen={onOpen} />);
    const card = await screen.findByRole('button', { name: /vault_abc123def4567890/ });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('vault_abc123def4567890');
  });

  it('shows a quiet empty state when there are no vaults', async () => {
    render(
      <VaultsListView api={fakeApi({ listVaults: vi.fn(async () => []) })} onOpen={vi.fn()} />,
    );
    await screen.findByText(/no vaults/i);
  });

  it('reports a load failure honestly instead of a blank page', async () => {
    const api = fakeApi({
      listVaults: vi.fn(async () => {
        throw new Error('listVaults 503: upstream down');
      }),
    });
    const { container } = render(<VaultsListView api={api} onOpen={vi.fn()} />);
    await screen.findByText(/listVaults 503/i);
    expect(container.querySelector('.inline-alert.show')).not.toBeNull();
  });
});
