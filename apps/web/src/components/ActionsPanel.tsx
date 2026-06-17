'use client';
import { useState } from 'react';
import { POLLING_STOP_STATES } from '../lib/use-intent-trace.js';

// The only place in the UI that offers write actions, and it is gated by the
// FSM state the server reports — never by client guesswork. DRAFT may validate
// (reject is gated off until a policy verdict exists); POLICY_VALIDATED may
// fast-forward to EXECUTED, but only against a real 64-hex casper-test deploy
// hash so the on-chain proof link can never be fabricated; terminal states
// expose nothing and say why. `busy` disables the primary action mid-submit.
export interface ActionsPanelProps {
  state?: string | undefined;
  busy?: boolean | undefined;
  error?: string | null | undefined;
  onValidate: () => void;
  onMarkExecuted: (deployHash: string) => void;
  onReject: (reason: string) => void;
}

const DEPLOY_HASH_RE = /^[0-9a-f]{64}$/;

function ErrText({ msg }: { msg: string }) {
  return (
    <div className="err-text">
      <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      {msg}
    </div>
  );
}

export function ActionsPanel({
  state,
  busy,
  error,
  onValidate,
  onMarkExecuted,
  onReject,
}: ActionsPanelProps) {
  const [deployHash, setDeployHash] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (state !== undefined && POLLING_STOP_STATES.includes(state)) {
    return (
      <div className="panel">
        <h3>
          Actions <span className="sub">terminal · {state}</span>
        </h3>
        <p className="terminal-note">
          This intent is terminal — no actions remain. Polling has stopped and the trace is sealed.
        </p>
      </div>
    );
  }

  if (state === 'DRAFT') {
    return (
      <div className="panel">
        <h3>
          Actions <span className="sub">gated · DRAFT</span>
        </h3>
        <div className="action-bar">
          <button type="button" className="btn btn-primary" onClick={onValidate}>
            Validate policy
          </button>
          <div className="gate-wrap">
            <button type="button" className="btn btn-danger" disabled>
              Reject intent
            </button>
            <span className="gate-tip">Validate the policy first</span>
          </div>
        </div>
        {error ? <ErrText msg={error} /> : null}
      </div>
    );
  }

  // Every other state is agent-driven or not yet known: the human console offers
  // no manual write here. The mark-executed fast-forward is valid only from
  // POLICY_VALIDATED, so the write controls live behind exactly that state.
  if (state !== 'POLICY_VALIDATED') {
    return (
      <div className="panel">
        <h3>
          Actions <span className="sub">{state ? `gated · ${state}` : 'loading…'}</span>
        </h3>
        <p className="idle-note">
          {state
            ? `No manual actions in ${state} — the agent is driving this step.`
            : 'Loading intent state…'}
        </p>
      </div>
    );
  }

  const hashValid = DEPLOY_HASH_RE.test(deployHash);
  const markDisabled = !hashValid || !!busy;

  return (
    <div className="panel">
      <h3>
        Actions <span className="sub">gated · {state}</span>
      </h3>
      <label className="label" htmlFor="deployHash">
        Deploy hash (64-hex)
      </label>
      <input
        id="deployHash"
        className="input"
        value={deployHash}
        onChange={(e) => setDeployHash(e.target.value)}
        placeholder="64-char casper-test deploy hash"
        style={{ marginBottom: 12 }}
      />
      <div className="action-bar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={markDisabled}
          onClick={() => onMarkExecuted(deployHash)}
        >
          Mark executed (demo)
        </button>
        <button type="button" className="btn btn-danger" onClick={() => setConfirming((v) => !v)}>
          Reject intent
        </button>
      </div>

      {confirming ? (
        <div className="confirm">
          <div className="ct">Reject this intent?</div>
          <div className="cdesc">
            This is terminal — polling will stop and the off-ramp is recorded on the trace.
          </div>
          <label className="label" htmlFor="reason">
            Reason
          </label>
          <input
            id="reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. amount exceeds policy cap"
          />
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => onReject(reason)}
            >
              Confirm reject
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrText msg={error} /> : null}
    </div>
  );
}
