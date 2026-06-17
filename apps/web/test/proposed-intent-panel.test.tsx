import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProposedIntentPanel } from '../src/components/ProposedIntentPanel.js';
import type { IntentBody } from '../src/lib/intent-view.js';

const BODY: IntentBody = {
  agent: `00${'aa'.repeat(32)}`,
  receiver: `00${'bb'.repeat(32)}`,
  token: 'cspr-test-cep18',
  contract: `00${'cc'.repeat(32)}`,
  network: 'casper:casper-test',
  amount: '500',
};

describe('ProposedIntentPanel', () => {
  it('renders the heading', () => {
    render(<ProposedIntentPanel body={BODY} />);
    expect(screen.getByRole('heading', { name: /proposed intent/i })).toBeDefined();
  });

  it('renders each field key in canonical order with its FULL (untruncated) value', () => {
    const { container } = render(<ProposedIntentPanel body={BODY} />);
    const dts = Array.from(container.querySelectorAll('.kv dt')).map((e) => e.textContent);
    expect(dts).toEqual(['agent', 'receiver', 'token', 'contract', 'network', 'amount']);
    const dds = Array.from(container.querySelectorAll('.kv dd')).map((e) => e.textContent);
    expect(dds).toContain('cspr-test-cep18');
    expect(dds).toContain('casper:casper-test');
    expect(dds).toContain('500');
    expect(dds).toContain(BODY.agent);
  });

  it('renders six dash placeholders when no body is captured yet', () => {
    const { container } = render(<ProposedIntentPanel />);
    const dds = Array.from(container.querySelectorAll('.kv dd')).map((e) => e.textContent);
    expect(dds).toHaveLength(6);
    expect(dds.every((v) => v === '—')).toBe(true);
  });
});
