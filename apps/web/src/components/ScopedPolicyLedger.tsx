'use client';
import { Fragment } from 'react';
import type { VaultDetail } from '../lib/api.js';
import { formatAmount, truncateHash } from '../lib/intent-list.js';
import { CopyButton } from './CopyButton.js';

// The vault's scoped policy as three honest sections: who it is (identity), what
// it may spend (limits), and how it lives (lifecycle). Every value is a real
// SignerGuardPolicy field — the long hashes get a copy affordance, and there is
// deliberately no expiry row because the policy has none to show.
function signerLabel(role: string): string {
  return role === 'local_dev' ? 'dev signer' : role;
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="spl-hash">
        <span className="mono muted" title={value}>
          {truncateHash(value)}
        </span>
        <CopyButton text={value} />
      </dd>
    </>
  );
}

export function ScopedPolicyLedger({ vault }: { vault: VaultDetail }) {
  return (
    <div className="panel spl">
      <span className="panel-corner">policy</span>
      <h3>Scoped policy ledger</h3>

      <section className="spl-group">
        <h4 className="spl-title">identity</h4>
        <dl className="kv">
          <dt>token</dt>
          <dd>{vault.token}</dd>
          <dt>receiver policy</dt>
          <dd>{vault.receiverPolicy}</dd>
          <HashRow label="contract" value={vault.contract} />
          {vault.allowedReceivers.map((r) => (
            <HashRow key={r} label="allowed receiver" value={r} />
          ))}
          <HashRow label="policy digest" value={vault.policyDigest} />
        </dl>
      </section>

      <section className="spl-group">
        <h4 className="spl-title">limits</h4>
        <dl className="kv">
          <dt>max single payment</dt>
          <dd className="mono">{formatAmount(vault.maxSinglePaymentAtomic)}</dd>
          <dt>per-day cap</dt>
          <dd className="mono">{formatAmount(vault.perDayCapAtomic)}</dd>
          <dt>trace id required</dt>
          <dd>{vault.requireTraceId ? 'yes' : 'no'}</dd>
        </dl>
      </section>

      <section className="spl-group">
        <h4 className="spl-title">lifecycle</h4>
        <dl className="kv">
          <dt>signer</dt>
          <dd>
            <span className={`sig-tag${vault.signerRole === 'local_dev' ? ' dev' : ''}`}>
              {signerLabel(vault.signerRole)}
            </span>
          </dd>
          <dt>allowed chains</dt>
          <dd className="spl-chains">
            {vault.allowedChainIds.map((c) => (
              <Fragment key={c}>
                <span className="chip mono">{c}</span>
              </Fragment>
            ))}
          </dd>
        </dl>
      </section>
    </div>
  );
}
