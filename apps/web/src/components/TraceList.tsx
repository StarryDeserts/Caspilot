import { StateBadge } from './StateBadge.js';
import { sanitize } from '../lib/redact.js';

export interface TraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload?: unknown;
}

export function TraceList({ entries }: { entries: TraceEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.atMs - b.atMs);
  return (
    <ul className="space-y-2">
      {sorted.map((e, i) => (
        <li key={i} className="bg-zinc-900 rounded p-3 space-y-1">
          <div className="flex items-center gap-2">
            <StateBadge state={e.state} />
            <span className="text-xs text-zinc-500">{new Date(e.atMs).toISOString()}</span>
            <span className="text-xs text-zinc-400">{e.kind}</span>
          </div>
          {e.payload !== undefined && (
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(sanitize(e.payload), null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
