import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FsmStepper } from '../src/components/FsmStepper.js';
import { HAPPY_PATH } from '../src/lib/intent-view.js';
import type { TraceEntry } from '../src/lib/api.js';

function row(state: string, kind = 'created'): TraceEntry {
  return { intentId: 'int_x', state, kind, atMs: 0, payload: undefined };
}

function stepClass(container: HTMLElement, label: string): string {
  const step = Array.from(container.querySelectorAll('.step')).find(
    (el) => el.querySelector('.step-label')?.textContent === label,
  );
  return step?.className ?? '<missing>';
}

describe('FsmStepper', () => {
  it('renders the 9 happy-path labels in canonical order', () => {
    const { container } = render(<FsmStepper entries={[row('DRAFT')]} />);
    const labels = Array.from(container.querySelectorAll('.step-label')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual([...HAPPY_PATH]);
  });

  it('marks reached states done and the latest happy state current', () => {
    const { container } = render(
      <FsmStepper entries={[row('DRAFT'), row('POLICY_VALIDATED', 'policy_check')]} />,
    );
    expect(stepClass(container, 'DRAFT')).toContain('done');
    expect(stepClass(container, 'POLICY_VALIDATED')).toContain('current');
    expect(stepClass(container, 'PAYMENT_REQUIRED')).not.toContain('done');
    expect(stepClass(container, 'PAYMENT_REQUIRED')).not.toContain('current');
  });

  it('renders a check glyph in done nodes only', () => {
    const { container } = render(
      <FsmStepper entries={[row('DRAFT'), row('POLICY_VALIDATED', 'policy_check')]} />,
    );
    const draft = Array.from(container.querySelectorAll('.step')).find(
      (el) => el.querySelector('.step-label')?.textContent === 'DRAFT',
    );
    const current = Array.from(container.querySelectorAll('.step')).find(
      (el) => el.querySelector('.step-label')?.textContent === 'POLICY_VALIDATED',
    );
    expect(draft?.querySelector('.node svg')).not.toBeNull();
    expect(current?.querySelector('.node svg')).toBeNull();
  });

  it('does not fabricate skipped states as done on the mark-executed fast-forward', () => {
    const { container } = render(
      <FsmStepper
        entries={[
          row('DRAFT'),
          row('POLICY_VALIDATED', 'policy_check'),
          row('EXECUTED', 'execution'),
        ]}
      />,
    );
    expect(stepClass(container, 'POLICY_VALIDATED')).toContain('done');
    expect(stepClass(container, 'PAYMENT_REQUIRED')).not.toContain('done');
    expect(stepClass(container, 'ACCEPTED_BY_NODE')).not.toContain('done');
    expect(stepClass(container, 'EXECUTED')).toContain('current');
  });

  it('flags the active off-ramp and leaves no step current', () => {
    const { container } = render(
      <FsmStepper
        entries={[
          row('DRAFT'),
          row('POLICY_VALIDATED', 'policy_check'),
          row('REJECTED', 'rejected'),
        ]}
      />,
    );
    expect(container.querySelectorAll('.step.current')).toHaveLength(0);
    const rejected = Array.from(container.querySelectorAll('.offramp .badge')).find((el) =>
      el.textContent?.includes('REJECTED'),
    );
    expect(rejected?.className).toContain('is-active');
  });

  it('shows the corner annotation when provided', () => {
    const { container } = render(
      <FsmStepper entries={[row('DRAFT')]} corner="casper:casper-test · synced" />,
    );
    expect(container.querySelector('.panel-corner')?.textContent).toContain('casper:casper-test');
  });
});
