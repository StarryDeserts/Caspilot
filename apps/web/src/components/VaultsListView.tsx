'use client';
import { useEffect, useState } from 'react';
import type { VaultSummary } from '../lib/api.js';
import { VaultCard } from './VaultCard.js';

// The intent list's seam, mirrored for vaults: a presentational component over
// an injected api slice, imported relatively so jsdom tests drive the whole path
// (load → render cards → navigate) with no transport. The page wrapper builds
// the real client + router. Read-only by design (D2) — no create affordance.
export interface VaultsListApi {
  listVaults(): Promise<VaultSummary[]>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function VaultsListView({
  api,
  onOpen,
}: {
  api: VaultsListApi;
  onOpen: (id: string) => void;
}) {
  const [vaults, setVaults] = useState<VaultSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listVaults()
      .then((list) => {
        if (live) setVaults(list);
      })
      .catch((e) => {
        if (live) {
          setLoadError(message(e));
          setVaults([]);
        }
      });
    return () => {
      live = false;
    };
  }, [api]);

  return (
    <div className="rail">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vaults</h1>
          <p className="page-purpose">
            The live signer policy and today's spend, projected from real state — nothing seeded.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="inline-alert show" role="alert" style={{ marginBottom: 16 }}>
          <AlertIcon />
          <div className="ia-body">
            Couldn't load vaults
            <div className="ia-code">{loadError}</div>
          </div>
        </div>
      ) : null}

      {vaults === null ? (
        <SkeletonCards />
      ) : vaults.length === 0 ? (
        <EmptyVaults />
      ) : (
        <div className="vault-grid">
          {vaults.map((v) => (
            <VaultCard key={v.id} vault={v} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

// Quiet, defensive empty state. The single live vault is always present, so this
// renders only if the backend ever returns an empty projection — and when it
// does it states that plainly rather than implying a missing feature.
function EmptyVaults() {
  return (
    <div className="table-wrap">
      <div className="empty">
        <div className="eicon">
          <svg viewBox="0 0 24 24" strokeWidth="1.6" aria-hidden="true">
            <rect x="4" y="7" width="16" height="13" rx="2" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" />
          </svg>
        </div>
        <div className="etitle">No vaults</div>
        <div className="emsg">No live signer policy is configured on this node.</div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="vault-grid">
      {[0, 1].map((c) => (
        <div className="vault-card" key={c}>
          <div className="vc-head">
            <span className="sk" style={{ width: 150 }} />
          </div>
          <div className="vc-meter">
            <span className="sk" style={{ width: 90 }} />
            <div className="meter-track" />
            <span className="sk" style={{ width: 120 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
