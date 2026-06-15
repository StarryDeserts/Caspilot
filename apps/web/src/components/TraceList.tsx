import { StateBadge } from './StateBadge.js';

export interface TraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload?: unknown;
}

const FRONTEND_FORBIDDEN_KEYS = new Set([
  'privateKey',
  'PRIVATE_KEY',
  'mnemonic',
  'seed',
  'apiKey',
  'API_KEY',
  'CSPR_CLOUD_KEY',
  'reasoning',
  'chainOfThought',
  'prompt',
  'env',
]);

function sanitize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FRONTEND_FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitize(v);
  }
  return out;
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
