'use client';
import { useMemo, useState } from 'react';
import type { MarkExecutedResult, ValidatePolicyResult } from '../lib/api.js';
import { useIntentTrace, POLLING_STOP_STATES, type TraceClient } from '../lib/use-intent-trace.js';
import { deriveIntent } from '../lib/intent-view.js';
import { CopyButton } from './CopyButton.js';
import { StateBadge } from './StateBadge.js';
import { FsmStepper } from './FsmStepper.js';
import { ProposedIntentPanel } from './ProposedIntentPanel.js';
import { ActionsPanel } from './ActionsPanel.js';
import { X402PaymentPanel } from './X402PaymentPanel.js';
import { OnChainProofPanel } from './OnChainProofPanel.js';
import { AuditTracePanel } from './AuditTracePanel.js';

// The detail view depends only on this slice of CaspilotApi: the trace read the
// polling hook needs, plus the three write actions the FSM gate may invoke. The
// real CaspilotApi satisfies it structurally; tests inject a fake so the whole
// client render path (hook → deriveIntent → panels → handlers) runs in jsdom
// with no transport. The page wrapper constructs the real client and passes it.
export interface IntentDetailApi extends TraceClient {
  validatePolicy(id: string): Promise<ValidatePolicyResult>;
  markExecuted(id: string, deployHash: string): Promise<MarkExecutedResult>;
  reject(id: string, reason: string): Promise<{ id: string; state: string }>;
}

export function IntentDetailView({ id, api }: { id: string; api: IntentDetailApi }) {
  const { entries, loading, notFound, error } = useIntentTrace(id, api);
  const view = useMemo(() => deriveIntent(entries), [entries]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // The live loop is running iff the intent has not been declared missing and
  // its latest state still has a successor. Mirrors the hook's own stop rule so
  // the "live" label and the trace panel never lie about polling.
  const polling =
    !notFound && (view.state === undefined || !POLLING_STOP_STATES.includes(view.state));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const onValidate = () => run(() => api.validatePolicy(id));
  const onMarkExecuted = (deployHash: string) => run(() => api.markExecuted(id, deployHash));
  const onReject = (reason: string) => run(() => api.reject(id, reason));

  return (
    <div className="rail">
      <div className="breadcrumb">
        <a href="/intents">Intents</a>
        <span className="sep">/</span>
        <span className="id">{id}</span>
        <CopyButton text={id} label="copy id" />
      </div>

      {notFound ? (
        <div className="fail-card notfound">
          <div className="ficon">
            <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <div className="ftitle">Intent not found</div>
          <div className="fmsg">getTrace 404 · no such intent on casper-test</div>
        </div>
      ) : (
        <>
          <div className="header-row">
            <div className="header-left">
              {view.state ? (
                <StateBadge state={view.state} size="lg" />
              ) : (
                <span className="badge draft lg">
                  <span className="bdot" />
                  {loading ? 'LOADING' : 'UNKNOWN'}
                </span>
              )}
            </div>
          </div>
          <p className="page-purpose">Propose → authorize → execute, fully on the record.</p>

          {error && entries.length === 0 ? (
            <div className="inline-alert show" style={{ marginBottom: 20 }}>
              <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <div className="ia-body">
                Trace temporarily unavailable — retrying every 2s.
                <div className="ia-code">{error}</div>
              </div>
            </div>
          ) : null}

          <FsmStepper
            entries={entries}
            corner={`casper:casper-test · ${polling ? 'live' : 'synced'}`}
          />

          <div className="body-grid">
            <div className="col">
              <ProposedIntentPanel body={view.body} />
              <ActionsPanel
                state={view.state}
                busy={busy}
                error={actionError}
                onValidate={onValidate}
                onMarkExecuted={onMarkExecuted}
                onReject={onReject}
              />
              <X402PaymentPanel
                state={view.state}
                amount={view.body?.amount}
                token={view.body?.token}
              />
            </div>

            <div className="col">
              <OnChainProofPanel deployHash={view.deployHash} />
              <AuditTracePanel entries={entries} polling={polling} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
