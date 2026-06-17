'use client';
import type { RecentDebit } from '../lib/api.js';
import { formatAmount, relativeTime, truncateId } from '../lib/intent-list.js';

// Today's debits against the day cap, newest-first. A reserved hold and a
// committed spend both count against budget, so both show — only a released hold
// (which returned budget) is absent, and that omission is the server's, not a
// filter here. No debits is a real, honest state: the cap is untouched.
export function RecentDebits({ debits, nowMs }: { debits: RecentDebit[]; nowMs: number }) {
  return (
    <div className="panel">
      <span className="panel-corner">today</span>
      <h3>Recent debits</h3>
      {debits.length === 0 ? (
        <p className="rd-empty">No debits today — the day cap is untouched.</p>
      ) : (
        <ul className="rd-list">
          {debits.map((d, i) => (
            <li className="rd-row" key={`${d.intentId}-${d.atMs}-${i}`}>
              <span className={`sbadge ${d.status}`}>{d.status}</span>
              <span className="rd-amount mono">{formatAmount(d.amount)}</span>
              <a className="rd-id mono muted" href={`/intents/${d.intentId}`} title={d.intentId}>
                {truncateId(d.intentId)}
              </a>
              <span className="rd-time muted">{relativeTime(d.atMs, nowMs)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
