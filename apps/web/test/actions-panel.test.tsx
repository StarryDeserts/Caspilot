import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionsPanel, type ActionsPanelProps } from '../src/components/ActionsPanel.js';

const HASH = 'a'.repeat(64); // valid 64-hex deploy hash

function setup(state: string, over: Partial<ActionsPanelProps> = {}) {
  const onValidate = vi.fn();
  const onMarkExecuted = vi.fn();
  const onReject = vi.fn();
  const utils = render(
    <ActionsPanel
      state={state}
      onValidate={onValidate}
      onMarkExecuted={onMarkExecuted}
      onReject={onReject}
      {...over}
    />,
  );
  return { onValidate, onMarkExecuted, onReject, ...utils };
}

describe('ActionsPanel gating', () => {
  it('DRAFT: validate policy is the action; reject is gated off until validated', () => {
    const { onValidate } = setup('DRAFT');
    fireEvent.click(screen.getByRole('button', { name: /validate policy/i }));
    expect(onValidate).toHaveBeenCalledTimes(1);
    const reject = screen.getByRole('button', { name: /reject intent/i }) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
  });

  it('POLICY_VALIDATED: mark-executed stays disabled until a valid 64-hex deploy hash is entered', () => {
    const { onMarkExecuted } = setup('POLICY_VALIDATED');
    const mark = screen.getByRole('button', { name: /mark executed/i }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);

    const input = screen.getByLabelText(/deploy hash/i);
    fireEvent.change(input, { target: { value: 'not-a-hash' } });
    expect(mark.disabled).toBe(true);

    fireEvent.change(input, { target: { value: HASH } });
    expect(mark.disabled).toBe(false);

    fireEvent.click(mark);
    expect(onMarkExecuted).toHaveBeenCalledWith(HASH);
  });

  it('POLICY_VALIDATED: rejecting opens a confirm, captures a reason, and calls onReject', () => {
    const { onReject } = setup('POLICY_VALIDATED');
    fireEvent.click(screen.getByRole('button', { name: /reject intent/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'amount exceeds vault cap' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));
    expect(onReject).toHaveBeenCalledWith('amount exceeds vault cap');
  });

  it('terminal states expose no actions and explain why', () => {
    const { container } = setup('EXECUTED');
    expect(screen.queryByRole('button', { name: /validate policy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark executed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject intent/i })).toBeNull();
    expect(container.querySelector('.terminal-note')).not.toBeNull();
  });

  it('unknown state (still loading) exposes no write actions, only an idle note', () => {
    const { container } = setup(undefined as unknown as string);
    expect(screen.queryByRole('button', { name: /validate policy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark executed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject intent/i })).toBeNull();
    expect(container.querySelector('.idle-note')).not.toBeNull();
  });

  it('agent-driven intermediate states expose no manual actions, only an idle note', () => {
    const { container } = setup('PAYMENT_REQUIRED');
    expect(screen.queryByRole('button', { name: /validate policy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark executed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject intent/i })).toBeNull();
    expect(container.querySelector('.idle-note')).not.toBeNull();
  });

  it('surfaces a backend error under the actions', () => {
    const { container } = setup('POLICY_VALIDATED', { error: 'reject 409: already terminal' });
    expect(container.querySelector('.err-text')?.textContent).toContain('409');
  });

  it('disables the primary action while a submit is in flight (busy)', () => {
    setup('POLICY_VALIDATED', { busy: true });
    fireEvent.change(screen.getByLabelText(/deploy hash/i), { target: { value: HASH } });
    const mark = screen.getByRole('button', { name: /mark executed/i }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);
  });
});
