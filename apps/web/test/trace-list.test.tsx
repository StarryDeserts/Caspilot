import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TraceList } from '../src/components/TraceList.js';

describe('TraceList', () => {
  it('renders entries in chronological order', () => {
    render(
      <TraceList
        entries={[
          { intentId: 'int_a', state: 'POLICY_VALIDATED', atMs: 2, kind: 'transition' },
          { intentId: 'int_a', state: 'DRAFT', atMs: 1, kind: 'created' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/DRAFT/);
    expect(items[1].textContent).toMatch(/POLICY_VALIDATED/);
  });

  it('refuses to render any payload key in FORBIDDEN list', () => {
    const { container } = render(
      <TraceList
        entries={[{ intentId: 'int_a', state: 'DRAFT', atMs: 1, kind: 'created', payload: { reasoning: 'should-not-render', ok: true } }]}
      />,
    );
    expect(container.textContent).not.toMatch(/should-not-render/);
    expect(container.textContent).toMatch(/ok/);
  });
});
