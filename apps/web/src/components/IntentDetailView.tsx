'use client';
import { useMemo, useState } from 'react';
import type {
  BuildUnsignedDeployResult,
  ConfirmOnchainResult,
  MarkExecutedResult,
  ValidatePolicyResult,
} from '../lib/api.js';
import type { ClickAccount, ClickSendResult } from '../lib/wallet.js';
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
  buildUnsignedDeploy(id: string, signerPk: string): Promise<BuildUnsignedDeployResult>;
  confirmOnchain(id: string, deployHash: string): Promise<ConfirmOnchainResult>;
}

// The wallet slice the live co-sign needs: a connected account and the
// sign+broadcast call. Structurally satisfied by the wallet context value, so the
// page passes useWallet() straight in; tests inject a fake. Optional — when absent
// the panel falls back to the demo mark-executed path.
export interface IntentDetailWallet {
  account: ClickAccount | null;
  signAndSubmit(txJson: object): Promise<ClickSendResult>;
}

export function IntentDetailView({
  id,
  api,
  wallet,
}: {
  id: string;
  api: IntentDetailApi;
  wallet?: IntentDetailWallet | undefined;
}) {
  const { entries, loading, notFound, error } = useIntentTrace(id, api);
  const view = useMemo(() => deriveIntent(entries), [entries]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [signStatus, setSignStatus] = useState<string | null>(null);

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

  // The live human co-sign: the backend builds an unsigned CEP-18 transfer FOR the
  // connected key (the user pays), the wallet pops to sign + broadcast, and only
  // the REAL returned deploy hash is verified on-chain before the intent advances.
  // A cancelled popup is a clean stop; an error surfaces. The provenance is never
  // fabricated — we confirm the chain, not the client's word.
  const account = wallet?.account ?? null;
  const onSignAndSubmit = () =>
    run(async () => {
      if (!account) return;
      setSignStatus('Building unsigned transfer…');
      const { envelope } = await api.buildUnsignedDeploy(id, account.publicKey);
      setSignStatus('Awaiting wallet signature…');
      const res = await wallet!.signAndSubmit(envelope.headerJson as object);
      if (res.cancelled) {
        setSignStatus('Signature cancelled — nothing was broadcast.');
        return;
      }
      // Prefer the canonical Casper 2.0 transactionHash; fall back to a legacy
      // deployHash. A status:'timeout' with a hash means CSPR.click stopped MONITORING
      // before finalization — the tx was still broadcast, so the presence of a hash,
      // not the absence of an error, decides success. The backend is the source of
      // truth on finality; we verify the hash on-chain rather than trust the SDK.
      const hash = res.transactionHash ?? res.deployHash;
      if (!hash) {
        setSignStatus(null);
        throw new Error(res.error ?? 'wallet returned no transaction hash');
      }
      setSignStatus(`Broadcast ${hash.slice(0, 10)}… — verifying on-chain…`);
      await api.confirmOnchain(id, hash);
      setSignStatus('Verified on-chain — intent executed.');
    });

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
                {...(wallet
                  ? { onSignAndSubmit, walletConnected: !!account, signStatus }
                  : {})}
              />
              <X402PaymentPanel
                state={view.state}
                amount={view.body?.amount}
                token={view.body?.token}
              />
            </div>

            <div className="col">
              <OnChainProofPanel deployHash={view.deployHash} kind={view.deployHashKind} />
              <AuditTracePanel entries={entries} polling={polling} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
