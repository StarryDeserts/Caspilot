import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentDebits } from '../src/components/RecentDebits.js';
import type { RecentDebit } from '../src/lib/api.js';

const NOW = 2_000_000_000_000;

const DEBITS: RecentDebit[] = [
  { amount: '500', status: 'committed', intentId: 'int_committed_1', traceId: 'trace_a', atMs: NOW - 60_000 },
  { amount: '300', status: 'reserved', intentId: 'int_reserved_1', traceId: 'trace_b', atMs: NOW - 5_000 },
];

describe('RecentDebits', () => {
  it('lists committed and reserved debits with amount, status, id, and age', () => {
    render(<RecentDebits debits={DEBITS} nowMs={NOW} />);
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('committed')).toBeTruthy();
    expect(screen.getByText('reserved')).toBeTruthy();
    // full id in the title; truncated in the body
    expect(screen.getByTitle('int_committed_1')).toBeTruthy();
    expect(screen.getByText('1m ago')).toBeTruthy();
    expect(screen.getByText('just now')).toBeTruthy();
  });

  it('shows a quiet note when there are no debits today', () => {
    render(<RecentDebits debits={[]} nowMs={NOW} />);
    expect(screen.getByText(/no debits today/i)).toBeTruthy();
  });
});
