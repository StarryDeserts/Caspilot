import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentForm } from '../src/components/IntentForm.js';
import { StateBadge } from '../src/components/StateBadge.js';

describe('IntentForm', () => {
  it('submits with valid hex addresses + amount', () => {
    const onSubmit = vi.fn();
    render(<IntentForm defaults={{ network: 'casper:casper-test' }} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/agent/i), {
      target: { value: '00' + 'aa'.repeat(32) },
    });
    fireEvent.change(screen.getByLabelText(/receiver/i), {
      target: { value: '00' + 'bb'.repeat(32) },
    });
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: 'cspr-cep18' } });
    fireEvent.change(screen.getByLabelText(/contract/i), {
      target: { value: '00' + 'cc'.repeat(32) },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('rejects non-account-hash agent', () => {
    const onSubmit = vi.fn();
    render(<IntentForm defaults={{ network: 'casper:casper-test' }} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/agent/i), { target: { value: 'not-hex' } });
    fireEvent.change(screen.getByLabelText(/receiver/i), {
      target: { value: '00' + 'bb'.repeat(32) },
    });
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: 'cspr-cep18' } });
    fireEvent.change(screen.getByLabelText(/contract/i), {
      target: { value: '00' + 'cc'.repeat(32) },
    });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/agent must be an account-hash hex/i)).toBeTruthy();
  });
});

describe('StateBadge', () => {
  it('uses red tone for failure-like terminal states', () => {
    const { container } = render(<StateBadge state="EXECUTION_FAILED" />);
    expect(container.innerHTML).toMatch(/red/);
  });
  it('uses green tone for FINALIZED', () => {
    const { container } = render(<StateBadge state="FINALIZED" />);
    expect(container.innerHTML).toMatch(/green/);
  });
});
