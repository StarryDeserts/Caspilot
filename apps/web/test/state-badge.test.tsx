import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StateBadge } from '../src/components/StateBadge.js';

// §6 FSM(12) → 6 semantic badge buckets
const BUCKETS: Array<[string, string]> = [
  ['DRAFT', 'draft'],
  ['POLICY_VALIDATED', 'validated'],
  ['PAYMENT_REQUIRED', 'payment'],
  ['PAYMENT_VERIFIED', 'inflight'],
  ['READY_TO_SUBMIT', 'inflight'],
  ['SIGNED_RECEIVED', 'inflight'],
  ['ACCEPTED_BY_NODE', 'inflight'],
  ['EXECUTED', 'executed'],
  ['FINALIZED', 'executed'],
  ['REJECTED', 'failed'],
  ['EXECUTION_FAILED', 'failed'],
  ['TIMEOUT', 'failed'],
];

describe('StateBadge', () => {
  it.each(BUCKETS)('maps %s to the %s badge bucket', (state, bucket) => {
    const { container } = render(<StateBadge state={state} />);
    const badge = container.querySelector('span.badge');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain(bucket);
  });

  it('renders the raw FSM state string so audit consumers can read it', () => {
    const { container } = render(<StateBadge state="POLICY_VALIDATED" />);
    expect(container.textContent).toContain('POLICY_VALIDATED');
  });

  it('renders a status dot indicator', () => {
    const { container } = render(<StateBadge state="DRAFT" />);
    expect(container.querySelector('.bdot')).not.toBeNull();
  });

  it('falls back to the neutral draft bucket for unknown states', () => {
    const { container } = render(<StateBadge state="WAT" />);
    expect(container.querySelector('span.badge')?.className).toContain('draft');
  });

  it('omits the lg modifier by default', () => {
    const { container } = render(<StateBadge state="DRAFT" />);
    expect(container.querySelector('span.badge')?.className).not.toContain('lg');
  });

  it('adds the lg modifier when size="lg" (header emphasis)', () => {
    const { container } = render(<StateBadge state="POLICY_VALIDATED" size="lg" />);
    const badge = container.querySelector('span.badge');
    expect(badge?.className).toContain('validated');
    expect(badge?.className).toContain('lg');
  });
});
