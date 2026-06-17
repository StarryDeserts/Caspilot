import { StateBadge } from './StateBadge.js';
import { sanitize } from '../lib/redact.js';
import type { TraceEntry } from '../lib/api.js';

// The audit trail, reverse-chronological. The redacted chip is driven only by
// the server's per-row `redacted` flag (never inferred), and payloads are
// re-sanitized client-side as defense in depth. The live label appears only
// while the polling loop is actually running.
export function AuditTracePanel({
  entries,
  polling,
}: {
  entries: TraceEntry[];
  polling: boolean;
}) {
  const rows = [...entries].sort((a, b) => b.atMs - a.atMs);
  return (
    <div className="panel">
      <div className="trace-head">
        <h3 style={{ margin: 0 }}>Audit trace</h3>
        {polling ? (
          <span className="live-label">
            <span className="live-dot" />
            live · polling every 2s
          </span>
        ) : null}
      </div>
      <p className="pay-desc" style={{ margin: '-4px 0 14px' }}>
        Reverse-chronological · polling stops at terminal states. Trace is redacted — reasoning
        never leaves the agent.
      </p>
      {rows.map((e, i) => (
        <div className="trace-row" key={`${e.atMs}-${e.kind}-${i}`}>
          <div className="trace-meta">
            <StateBadge state={e.state} />
            <span className="trace-ts">{new Date(e.atMs).toISOString()}</span>
            <span className="trace-kind">{e.kind}</span>
            {e.redacted ? (
              <span className="redacted-chip" title="reasoning never leaves the agent">
                redacted
              </span>
            ) : null}
          </div>
          {e.payload !== undefined ? (
            <div className="trace-payload">{JSON.stringify(sanitize(e.payload), null, 2)}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
