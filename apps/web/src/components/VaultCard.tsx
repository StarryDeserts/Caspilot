'use client';
import type { VaultSummary } from '../lib/api.js';
import { formatAmount } from '../lib/intent-list.js';
import { meterClass, meterPct } from '../lib/vault.js';

// A single vault rendered as a clickable card whose headline signal is the
// day-cap meter. The whole card is the hit area (role=button, tabIndex 0) so Tab
// reaches it and Enter/Space activate it — mirroring the intent row affordance.
// `expired` striping is accepted for symmetry with a future revoked/expired
// vault, but the one live vault never sets it (no expiry exists on the policy).
export function VaultCard({
  vault,
  onOpen,
  expired = false,
}: {
  vault: VaultSummary;
  onOpen: (id: string) => void;
  expired?: boolean;
}) {
  const pct = meterPct(vault.usedTodayAtomic, vault.perDayCapAtomic);
  const level = meterClass(pct);

  function activate() {
    onOpen(vault.id);
  }

  return (
    <div
      className={`vault-card${expired ? ' expired' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${vault.id} · ${pct}% of day cap used`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className="vc-head">
        <span className="vc-id mono" title={vault.id}>
          {vault.id}
        </span>
        <span className="vc-token mono muted">{vault.token}</span>
        <svg className="vc-chevron" viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>

      <div className="vc-meter">
        <div className="vc-meter-label">
          <span className="vc-meter-title">daily cap used</span>
          <span className={`vc-pct ${level}`}>{pct}%</span>
        </div>
        <div className="meter-track">
          <div className={`meter-fill ${level}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="vc-amounts">
          <span className="mono">{formatAmount(vault.usedTodayAtomic)}</span>
          <span className="vc-sep"> / </span>
          <span className="mono muted">{formatAmount(vault.perDayCapAtomic)}</span>
        </div>
        {pct >= 80 ? <div className="vc-near-cap">near day cap</div> : null}
      </div>
    </div>
  );
}
