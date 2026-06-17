import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScopedPolicyLedger } from '../src/components/ScopedPolicyLedger.js';
import type { VaultDetail } from '../src/lib/api.js';

function vault(over: Partial<VaultDetail> = {}): VaultDetail {
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
    allowedChainIds: ['casper:casper-test'],
    requireTraceId: false,
    recentDebits: [],
    ...over,
  };
}

describe('ScopedPolicyLedger', () => {
  it('groups identity, limits, and lifecycle facts from the real policy', () => {
    render(<ScopedPolicyLedger vault={vault()} />);
    expect(screen.getByText(/identity/i)).toBeTruthy();
    expect(screen.getByText(/limits/i)).toBeTruthy();
    expect(screen.getByText(/lifecycle/i)).toBeTruthy();
    expect(screen.getByText('cspr-test-cep18')).toBeTruthy();
    expect(screen.getByText('allowlist')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('100,000')).toBeTruthy();
    expect(screen.getByText('casper:casper-test')).toBeTruthy();
  });

  it('tags a local_dev signer neutrally as a dev signer (a fact, not an error)', () => {
    render(<ScopedPolicyLedger vault={vault()} />);
    expect(screen.getByText(/dev signer/i)).toBeTruthy();
  });

  it('offers a copy affordance for the long hashes', () => {
    render(<ScopedPolicyLedger vault={vault()} />);
    expect(screen.getAllByRole('button', { name: /copy/i }).length).toBeGreaterThan(0);
  });

  it('never fabricates an expiry the policy does not have', () => {
    render(<ScopedPolicyLedger vault={vault()} />);
    expect(screen.queryByText(/expires|valid until|expiry/i)).toBeNull();
  });
});
