import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { X402PaymentPanel } from '../src/components/X402PaymentPanel.js';

describe('X402PaymentPanel', () => {
  it('renders nothing unless the intent is awaiting payment', () => {
    for (const state of [undefined, 'DRAFT', 'POLICY_VALIDATED', 'EXECUTED']) {
      const { container } = render(
        <X402PaymentPanel state={state} amount="500" token="cspr-test-cep18" />,
      );
      expect(container.firstChild).toBeNull();
    }
  });

  it('surfaces the 402 and the amount due when PAYMENT_REQUIRED', () => {
    const { container } = render(
      <X402PaymentPanel state="PAYMENT_REQUIRED" amount="500" token="cspr-test-cep18" />,
    );
    expect(container.textContent).toContain('402');
    expect(container.textContent).toContain('500');
    expect(container.textContent).toContain('cspr-test-cep18');
  });
});
