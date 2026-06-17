'use client';
import { useState } from 'react';
import type { CreateIntentBody } from '../lib/api.js';

// Canonical client-side shape checks (mirror the design artifact): an
// account-hash is `00` + 64 hex (either case); an amount is a non-negative
// decimal string. These guard obvious typos before a round-trip — the API and
// on-chain layer remain the source of truth, so a server 422 still renders
// inline via `serverError`.
const HEX = /^00[0-9a-fA-F]{64}$/;
const DEC = /^[0-9]+(\.[0-9]+)?$/;

const NETWORK = 'casper:casper-test';

interface Fields {
  agent: string;
  receiver: string;
  contract: string;
  token: string;
  amount: string;
}

const EMPTY: Fields = {
  agent: '',
  receiver: '',
  contract: '',
  token: 'cspr-test-cep18',
  amount: '',
};

function validate(f: Fields): Partial<Record<keyof Fields, string>> {
  const errs: Partial<Record<keyof Fields, string>> = {};
  if (!HEX.test(f.agent.trim())) errs.agent = 'agent must be 00 + 64 hex chars';
  if (!HEX.test(f.receiver.trim())) errs.receiver = 'receiver must be 00 + 64 hex chars';
  if (!HEX.test(f.contract.trim())) errs.contract = 'contract must be 00 + 64 hex chars';
  if (f.token.trim() === '') errs.token = 'token is required';
  if (!DEC.test(f.amount.trim())) errs.amount = 'amount must be a decimal string';
  return errs;
}

function ErrIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function NewIntentDrawer({
  open,
  busy,
  serverError,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy?: boolean;
  serverError?: string | null;
  onClose: () => void;
  onCreate: (value: CreateIntentBody) => void;
}) {
  const [f, setF] = useState<Fields>(EMPTY);
  // Errors show only after a submit attempt, then track live edits — so the
  // drawer isn't pre-painted red, but a flagged field clears as you fix it.
  const [touched, setTouched] = useState(false);
  const errs = touched ? validate(f) : {};

  function field<K extends keyof Fields>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function submit() {
    setTouched(true);
    const e = validate(f);
    if (Object.keys(e).length > 0) return;
    onCreate({
      agent: f.agent.trim(),
      receiver: f.receiver.trim(),
      contract: f.contract.trim(),
      token: f.token.trim(),
      network: NETWORK,
      amount: f.amount.trim(),
    });
  }

  const rows: Array<{ id: keyof Fields; label: string }> = [
    { id: 'agent', label: 'Agent · account-hash (00 + 64 hex)' },
    { id: 'receiver', label: 'Receiver · account-hash (00 + 64 hex)' },
    { id: 'token', label: 'Token' },
    { id: 'contract', label: 'Contract · account-hash (00 + 64 hex)' },
  ];

  return (
    <>
      <div className={`scrim${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer${open ? ' open' : ''}`} role="dialog" aria-label="New intent">
        <div className="drawer-head">
          <h2>New intent</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          <div className={`inline-alert${serverError ? ' show' : ''}`} role="alert">
            <ErrIcon />
            <div className="ia-body">
              Couldn't create intent
              {serverError ? <div className="ia-code">{serverError}</div> : null}
            </div>
          </div>

          {rows.map((row) => (
            <div className={`field${errs[row.id] ? ' has-err' : ''}`} id={`f-${row.id}`} key={row.id}>
              <label htmlFor={row.id}>{row.label}</label>
              <input
                id={row.id}
                spellCheck={false}
                className={errs[row.id] ? 'invalid' : undefined}
                value={f[row.id]}
                onChange={field(row.id)}
              />
              {errs[row.id] ? (
                <div className="err">
                  <ErrIcon />
                  {errs[row.id]}
                </div>
              ) : null}
            </div>
          ))}

          <div className="field">
            <label>Network</label>
            <div className="netchip">
              <svg className="lock" viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {NETWORK}
              <span className="ro">read-only</span>
            </div>
          </div>

          <div className={`field${errs.amount ? ' has-err' : ''}`} id="f-amount">
            <label htmlFor="amount">Amount · decimal string</label>
            <input
              id="amount"
              spellCheck={false}
              className={errs.amount ? 'invalid' : undefined}
              value={f.amount}
              onChange={field('amount')}
            />
            {errs.amount ? (
              <div className="err">
                <ErrIcon />
                {errs.amount}
              </div>
            ) : null}
          </div>
        </div>

        <div className="drawer-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Creating…
              </>
            ) : (
              'Create intent'
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
