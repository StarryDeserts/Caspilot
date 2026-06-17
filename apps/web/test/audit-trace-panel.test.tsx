import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditTracePanel } from '../src/components/AuditTracePanel.js';
import type { TraceEntry } from '../src/lib/api.js';

function entry(over: Partial<TraceEntry> & { state: string; kind: string }): TraceEntry {
  return { intentId: 'int_x', atMs: 0, payload: undefined, ...over };
}

const created = entry({
  state: 'DRAFT',
  kind: 'created',
  atMs: 1,
  payload: { body: { amount: 500 } },
});
const validated = entry({
  state: 'POLICY_VALIDATED',
  kind: 'policy_check',
  atMs: 2,
  redacted: true,
  payload: { allowed: true },
});

describe('AuditTracePanel', () => {
  it('orders rows newest-first regardless of input order', () => {
    const { container } = render(<AuditTracePanel entries={[created, validated]} polling />);
    const rows = Array.from(container.querySelectorAll('.trace-row'));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('POLICY_VALIDATED');
    expect(rows[1]?.textContent).toContain('DRAFT');
  });

  it('renders the redacted chip only on rows the server flagged redacted', () => {
    const { container } = render(<AuditTracePanel entries={[created, validated]} polling />);
    expect(container.querySelectorAll('.redacted-chip')).toHaveLength(1);
    const validatedRow = Array.from(container.querySelectorAll('.trace-row')).find((r) =>
      r.textContent?.includes('POLICY_VALIDATED'),
    );
    expect(validatedRow?.querySelector('.redacted-chip')).not.toBeNull();
  });

  it('shows the live polling label only while polling', () => {
    const { container: a } = render(<AuditTracePanel entries={[created]} polling />);
    expect(a.querySelector('.live-label')).not.toBeNull();
    const { container: b } = render(<AuditTracePanel entries={[created]} polling={false} />);
    expect(b.querySelector('.live-label')).toBeNull();
  });

  it('states the channel guarantee in the subtitle', () => {
    render(<AuditTracePanel entries={[created]} polling />);
    expect(screen.getByText(/reasoning never leaves the agent/i)).toBeDefined();
  });

  it('defensively strips forbidden keys from payloads before rendering', () => {
    const leak = entry({
      state: 'DRAFT',
      kind: 'created',
      atMs: 1,
      payload: { ok: 1, PRIVATE_KEY: 'supersecret' },
    });
    const { container } = render(<AuditTracePanel entries={[leak]} polling />);
    expect(container.textContent).not.toContain('PRIVATE_KEY');
    expect(container.textContent).not.toContain('supersecret');
  });

  it('renders a valid empty panel (heading, no rows) when there are no entries', () => {
    const { container } = render(<AuditTracePanel entries={[]} polling={false} />);
    expect(container.querySelectorAll('.trace-row')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /audit trace/i })).toBeDefined();
  });
});
