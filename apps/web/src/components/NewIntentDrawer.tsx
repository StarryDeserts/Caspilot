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
// Native transfers target a PublicKey (01 + ED25519 / 02 + SECP256K1), not an
// account-hash — the node credits the account derived from it.
const PUBKEY = /^(?:01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;

const NETWORK = 'casper:casper-test';

// The native-CSPR path carries no contract package; this sentinel fills the
// intent's `contract` field. MUST match NATIVE_SENTINEL_PACKAGE in the API's
// deps.ts, which allowlists it and lets the router branch to the native builder.
const NATIVE_SENTINEL = 'native-cspr-transfer';

// CEP-18 moves a token through its package; Native CSPR moves the chain's own
// value (the only shape the live CSPR.click co-sign path can actually broadcast).
type Mode = 'cep18' | 'native';

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

function validate(f: Fields, mode: Mode): Partial<Record<keyof Fields, string>> {
  const errs: Partial<Record<keyof Fields, string>> = {};
  if (!HEX.test(f.agent.trim())) errs.agent = 'agent must be 00 + 64 hex chars';
  if (mode === 'native') {
    // Native targets a PublicKey (the node credits the derived account); the
    // value moved is CSPR itself, so there's no token/contract package to check.
    if (!PUBKEY.test(f.receiver.trim()))
      errs.receiver = 'receiver must be a public key (01/02 + hex)';
  } else {
    if (!HEX.test(f.receiver.trim())) errs.receiver = 'receiver must be 00 + 64 hex chars';
    if (!HEX.test(f.contract.trim())) errs.contract = 'contract must be 00 + 64 hex chars';
    if (f.token.trim() === '') errs.token = 'token is required';
  }
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
  const [mode, setMode] = useState<Mode>('cep18');
  const isNative = mode === 'native';
  // Errors show only after a submit attempt, then track live edits — so the
  // drawer isn't pre-painted red, but a flagged field clears as you fix it.
  const [touched, setTouched] = useState(false);
  const errs = touched ? validate(f, mode) : {};

  function field<K extends keyof Fields>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function submit() {
    setTouched(true);
    const e = validate(f, mode);
    if (Object.keys(e).length > 0) return;
    onCreate({
      agent: f.agent.trim(),
      receiver: f.receiver.trim(),
      // Native carries no package: the sentinel fills `contract` and token is the
      // chain's own 'CSPR'. CEP-18 passes the user's package + token through.
      contract: isNative ? NATIVE_SENTINEL : f.contract.trim(),
      token: isNative ? 'CSPR' : f.token.trim(),
      network: NETWORK,
      amount: f.amount.trim(),
    });
  }

  // Native mode shows only agent + a PublicKey receiver; CEP-18 also takes the
  // token symbol and its contract package (both account-hash hex).
  const rows: Array<{ id: keyof Fields; label: string }> = isNative
    ? [
        { id: 'agent', label: 'Agent · account-hash (00 + 64 hex)' },
        { id: 'receiver', label: 'Receiver · public key (01/02 + hex)' },
      ]
    : [
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

          <div className="field">
            <label>Transfer type</label>
            <div className="segmented" role="group" aria-label="Transfer type">
              <button
                type="button"
                className={`seg${!isNative ? ' active' : ''}`}
                aria-pressed={!isNative}
                onClick={() => setMode('cep18')}
              >
                CEP-18 token
              </button>
              <button
                type="button"
                className={`seg${isNative ? ' active' : ''}`}
                aria-pressed={isNative}
                onClick={() => setMode('native')}
              >
                Native CSPR
              </button>
            </div>
          </div>

          {rows.map((row) => (
            <div
              className={`field${errs[row.id] ? ' has-err' : ''}`}
              id={`f-${row.id}`}
              key={row.id}
            >
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
            <label htmlFor="amount">
              {isNative ? 'Amount · motes' : 'Amount · decimal string'}
            </label>
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
