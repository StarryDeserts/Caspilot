import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultForm } from '../src/components/VaultForm.js';

describe('VaultForm', () => {
  it('renders all required fields', () => {
    render(<VaultForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/admin/i)).toBeTruthy();
    expect(screen.getByLabelText(/cep-18 contract/i)).toBeTruthy();
    expect(screen.getByLabelText(/max single payment/i)).toBeTruthy();
    expect(screen.getByLabelText(/daily limit/i)).toBeTruthy();
    expect(screen.getByLabelText(/valid until/i)).toBeTruthy();
  });

  it('blocks submit when admin is empty', () => {
    const onSubmit = vi.fn();
    render(<VaultForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('emits normalized values on submit', () => {
    const onSubmit = vi.fn();
    render(<VaultForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/admin/i), { target: { value: '00' + 'aa'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/cep-18 contract/i), { target: { value: '00' + 'bb'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/max single payment/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/daily limit/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/valid until/i), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.admin.startsWith('00')).toBe(true);
    expect(payload.maxSinglePayment).toBe('1000');
    expect(typeof payload.validUntilMs).toBe('number');
  });
});
