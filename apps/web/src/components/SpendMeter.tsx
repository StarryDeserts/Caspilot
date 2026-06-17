'use client';
import { useEffect, useState } from 'react';
import type { RecentDebit } from '../lib/api.js';
import { formatAmount } from '../lib/intent-list.js';
import { prefersReducedMotion } from '../lib/reveal.js';
import { capMarkerPct, meterClass, meterPct, resetCountdown } from '../lib/vault.js';

// The day-cap budget made legible: a segmented track (one segment per debit, so
// the bar shows *what* consumed the budget, not just how much), a marker at
// where a single max payment would land, and a live countdown to the UTC reset.
// The countdown only ticks when motion is allowed — under prefers-reduced-motion
// it shows the value computed once at mount and never starts an interval.
export function SpendMeter({
  usedAtomic,
  capAtomic,
  singleAtomic,
  debits,
  nowMs,
}: {
  usedAtomic: string;
  capAtomic: string;
  singleAtomic: string;
  debits: RecentDebit[];
  nowMs: number;
}) {
  const pct = meterPct(usedAtomic, capAtomic);
  const level = meterClass(pct);
  const markerPct = capMarkerPct(singleAtomic, capAtomic);

  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel spend-meter">
      <span className="panel-corner">day cap</span>
      <h3>Daily spend</h3>

      <div className="sm-head">
        <span className="sm-title">used today</span>
        <span className={`sm-pct ${level}`}>{`${pct}% used`}</span>
      </div>

      <div className="meter-track sm-track">
        {debits.map((d, i) => (
          <div
            key={`${d.intentId}-${i}`}
            className={`meter-seg ${d.status}`}
            style={{ width: `${meterPct(d.amount, capAtomic)}%` }}
            title={`${formatAmount(d.amount)} ${d.status}`}
          />
        ))}
        <div
          className="sm-marker"
          style={{ left: `${markerPct}%` }}
          title={`max single payment ${formatAmount(singleAtomic)}`}
          aria-hidden="true"
        />
      </div>

      <div className="sm-foot">
        <span className="sm-amounts mono">
          <span>{formatAmount(usedAtomic)}</span>
          <span className="vc-sep"> / </span>
          <span className="muted">{formatAmount(capAtomic)}</span>
        </span>
        <span className="sm-reset">resets in {resetCountdown(now)}</span>
      </div>
    </div>
  );
}
