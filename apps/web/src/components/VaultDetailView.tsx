'use client';
import { useEffect, useState } from 'react';
import type { VaultDetail } from '../lib/api.js';
import { CopyButton } from './CopyButton.js';
import { ScopedPolicyLedger } from './ScopedPolicyLedger.js';
import { SpendMeter } from './SpendMeter.js';
import { RecentDebits } from './RecentDebits.js';

// The detail view depends only on this slice of CaspilotApi: a single vault read.
// The real client satisfies it structurally; tests inject a fake so the whole
// client render path (load → ScopedPolicyLedger + SpendMeter + RecentDebits)
// runs in jsdom with no transport. The page wrapper constructs the real client.
export interface VaultDetailApi {
  getVault(id: string): Promise<VaultDetail>;
}

export function VaultDetailView({ id, api }: { id: string; api: VaultDetailApi }) {
  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A single mount-time anchor shared by the meter countdown and the relative
  // debit ages, so both read the same "now".
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    api
      .getVault(id)
      .then((v) => {
        if (live) setVault(v);
      })
      .catch((e: unknown) => {
        if (!live) return;
        const msg = e instanceof Error ? e.message : String(e);
        // A 404 is an honest "no such vault", not a transport failure — render
        // the missing card instead of the retry alert.
        if (/\b404\b/.test(msg)) setNotFound(true);
        else setError(msg);
      });
    return () => {
      live = false;
    };
  }, [id, api]);

  return (
    <div className="rail">
      <div className="breadcrumb">
        <a href="/vaults">Vaults</a>
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
          <div className="ftitle">Vault not found</div>
          <div className="fmsg">getVault 404 · no such vault on casper-test</div>
        </div>
      ) : (
        <>
          <div className="page-head">
            <h1 className="page-title">Vault</h1>
            <p className="page-purpose">
              The live signer policy and today&apos;s spend, projected from real state.
            </p>
          </div>

          {error ? (
            <div className="inline-alert show" role="alert" style={{ marginBottom: 20 }}>
              <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <div className="ia-body">
                Couldn&apos;t load this vault
                <div className="ia-code">{error}</div>
              </div>
            </div>
          ) : vault === null ? (
            <div className="panel">
              <span className="sk" style={{ display: 'block', width: 180 }} />
              <span className="sk" style={{ display: 'block', width: 120, marginTop: 10 }} />
            </div>
          ) : (
            <div className="body-grid">
              <div className="col">
                <ScopedPolicyLedger vault={vault} />
              </div>
              <div className="col">
                <SpendMeter
                  usedAtomic={vault.usedTodayAtomic}
                  capAtomic={vault.perDayCapAtomic}
                  singleAtomic={vault.maxSinglePaymentAtomic}
                  debits={vault.recentDebits}
                  nowMs={nowMs}
                />
                <RecentDebits debits={vault.recentDebits} nowMs={nowMs} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
