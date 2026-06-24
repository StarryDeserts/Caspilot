import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewIntentDrawer } from '../src/components/NewIntentDrawer.js';

const HEX_A = `00${'a'.repeat(64)}`;
const HEX_B = `00${'b'.repeat(64)}`;
const HEX_C = `00${'c'.repeat(64)}`;

function setup(over: Partial<Parameters<typeof NewIntentDrawer>[0]> = {}) {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <NewIntentDrawer open onClose={onClose} onCreate={onCreate} {...over} />,
  );
  const input = (id: string) => utils.container.querySelector<HTMLInputElement>(`#${id}`)!;
  const fillValid = () => {
    fireEvent.change(input('agent'), { target: { value: HEX_A } });
    fireEvent.change(input('receiver'), { target: { value: HEX_B } });
    fireEvent.change(input('contract'), { target: { value: HEX_C } });
    fireEvent.change(input('token'), { target: { value: 'cspr-test-cep18' } });
    fireEvent.change(input('amount'), { target: { value: '500' } });
  };
  return { ...utils, onCreate, onClose, input, fillValid };
}

describe('NewIntentDrawer', () => {
  it('locks the network to casper:casper-test as a read-only chip, not an input', () => {
    const { container } = setup();
    expect(container.querySelector('.netchip')?.textContent).toContain('casper:casper-test');
    expect(container.querySelector('#network')).toBeNull();
  });

  it('blocks submit and flags every invalid field', () => {
    const { container, onCreate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onCreate).not.toHaveBeenCalled();
    for (const f of ['f-agent', 'f-receiver', 'f-contract', 'f-amount']) {
      expect(container.querySelector(`#${f}`)?.className).toContain('has-err');
    }
    expect(screen.getByText('agent must be 00 + 64 hex chars')).toBeTruthy();
    expect(screen.getByText('amount must be a decimal string')).toBeTruthy();
  });

  it('rejects an uppercase-but-wrong-length hash and a non-decimal amount', () => {
    const { container, input, onCreate } = setup();
    fireEvent.change(input('agent'), { target: { value: '00ABC' } });
    fireEvent.change(input('amount'), { target: { value: '1.2.3' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(container.querySelector('#f-agent')?.className).toContain('has-err');
    expect(container.querySelector('#f-amount')?.className).toContain('has-err');
  });

  it('accepts a valid account-hash (case-insensitive) and decimal amount', () => {
    const { input, fillValid, onCreate } = setup();
    fillValid();
    fireEvent.change(input('agent'), { target: { value: `00${'A'.repeat(64)}` } });
    fireEvent.change(input('amount'), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onCreate).toHaveBeenCalledWith({
      agent: `00${'A'.repeat(64)}`,
      receiver: HEX_B,
      contract: HEX_C,
      token: 'cspr-test-cep18',
      network: 'casper:casper-test',
      amount: '12.50',
    });
  });

  it('surfaces a server 422 as an inline alert with the raw code', () => {
    const { container } = setup({
      serverError: 'createIntent 422: amount exceeds vault daily cap (1000 < 1500)',
    });
    const alert = container.querySelector('.inline-alert');
    expect(alert?.className).toContain('show');
    expect(alert?.textContent).toContain('amount exceeds vault daily cap');
  });

  it('disables the submit control while a create is in flight', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: /creating/i })).toHaveProperty('disabled', true);
  });

  it('closes from the Cancel button', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

// Native-CSPR mode: the value moved IS native CSPR (the wallet already holds
// testnet CSPR), so token is fixed to 'CSPR', there is no contract package
// (a sentinel fills the field), and the receiver is a PublicKey — not an
// account-hash. This is the only intent shape the live CSPR.click co-sign path
// can actually broadcast, so the drawer must be able to create it.
const PUBKEY = `01${'c'.repeat(64)}`;

describe('NewIntentDrawer — native CSPR mode', () => {
  function toNative(utils: ReturnType<typeof setup>) {
    fireEvent.click(screen.getByRole('button', { name: /native cspr/i }));
    return utils;
  }

  it('defaults to CEP-18 mode (the token + contract inputs are present)', () => {
    const { input } = setup();
    expect(input('token')).toBeTruthy();
    expect(input('contract')).toBeTruthy();
  });

  it('hides the token + contract inputs once native mode is selected', () => {
    const utils = setup();
    toNative(utils);
    expect(utils.container.querySelector('#token')).toBeNull();
    expect(utils.container.querySelector('#contract')).toBeNull();
  });

  it('creates a native intent: token CSPR, sentinel contract, pubkey receiver, motes amount', () => {
    const utils = setup();
    toNative(utils);
    fireEvent.change(utils.input('agent'), { target: { value: HEX_A } });
    fireEvent.change(utils.input('receiver'), { target: { value: PUBKEY } });
    fireEvent.change(utils.input('amount'), { target: { value: '2500000000' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(utils.onCreate).toHaveBeenCalledWith({
      agent: HEX_A,
      receiver: PUBKEY,
      contract: 'native-cspr-transfer',
      token: 'CSPR',
      network: 'casper:casper-test',
      amount: '2500000000',
    });
  });

  it('rejects an account-hash receiver in native mode (must be a public key)', () => {
    const utils = setup();
    toNative(utils);
    fireEvent.change(utils.input('agent'), { target: { value: HEX_A } });
    fireEvent.change(utils.input('receiver'), { target: { value: HEX_B } });
    fireEvent.change(utils.input('amount'), { target: { value: '2500000000' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(utils.onCreate).not.toHaveBeenCalled();
    expect(utils.container.querySelector('#f-receiver')?.className).toContain('has-err');
  });
});
