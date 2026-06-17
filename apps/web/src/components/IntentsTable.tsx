'use client';
import type { IntentSummary } from '../lib/api.js';
import { relativeTime, truncateId, truncateHash, formatAmount } from '../lib/intent-list.js';
import { StateBadge } from './StateBadge.js';

// Each row is the navigation target — the whole row is the hit area, not just a
// link in one cell. It is exposed as a single focusable control (role=button,
// tabIndex 0) so Tab reaches it and Enter/Space activate it, matching the
// pointer affordance. Space is preventDefault'd so it navigates instead of
// scrolling the page.
function IntentRow({
  intent,
  nowMs,
  onOpen,
}: { intent: IntentSummary; nowMs: number; onOpen: (id: string) => void }) {
  function activate() {
    onOpen(intent.id);
  }
  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`${intent.id} · ${intent.state}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <td className="mono id" title={intent.id}>
        {truncateId(intent.id)}
      </td>
      <td className="mono muted" title={intent.agent}>
        {truncateHash(intent.agent)}
      </td>
      <td className="mono muted" title={intent.receiver}>
        {truncateHash(intent.receiver)}
      </td>
      <td className="mono">{intent.token}</td>
      <td className="num">{formatAmount(intent.amount)}</td>
      <td>
        <StateBadge state={intent.state} />
      </td>
      <td className="muted">{relativeTime(intent.updatedAtMs, nowMs)}</td>
    </tr>
  );
}

export function IntentsTable({
  intents,
  nowMs,
  onOpen,
  corner,
}: {
  intents: readonly IntentSummary[];
  nowMs: number;
  onOpen: (id: string) => void;
  corner?: string;
}) {
  return (
    <div className="table-wrap">
      {corner ? <span className="corner">{corner}</span> : null}
      <table>
        <thead>
          <tr>
            <th>Intent</th>
            <th>Agent</th>
            <th>Receiver</th>
            <th>Token</th>
            <th className="num">Amount</th>
            <th>State</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {intents.map((i) => (
            <IntentRow key={i.id} intent={i} nowMs={nowMs} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
