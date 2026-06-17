import type { IntentSummary } from './api.js';

// The list page's toolbar segments. "all" is the unfiltered total; the four
// named buckets each map to a precise set of FSM states (see FILTER_STATES).
// In-flight states (PAYMENT_*, READY_TO_SUBMIT, SIGNED_RECEIVED,
// ACCEPTED_BY_NODE) intentionally fall into no named bucket — they surface only
// under "All", so a segment count never over-claims an intent's progress.
export type FilterKey = 'all' | 'draft' | 'validated' | 'executed' | 'rejected';

export const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'validated', label: 'Validated' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
];

const FILTER_STATES: Record<Exclude<FilterKey, 'all'>, readonly string[]> = {
  draft: ['DRAFT'],
  validated: ['POLICY_VALIDATED'],
  executed: ['EXECUTED', 'FINALIZED'],
  rejected: ['REJECTED', 'EXECUTION_FAILED', 'TIMEOUT'],
};

export function matchesFilter(state: string, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  return FILTER_STATES[filter].includes(state);
}

export function matchesSearch(intent: IntentSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return intent.id.toLowerCase().includes(q) || intent.agent.toLowerCase().includes(q);
}

export function filterCounts(intents: readonly IntentSummary[]): Record<FilterKey, number> {
  const counts: Record<FilterKey, number> = {
    all: intents.length,
    draft: 0,
    validated: 0,
    executed: 0,
    rejected: 0,
  };
  for (const i of intents) {
    for (const key of ['draft', 'validated', 'executed', 'rejected'] as const) {
      if (matchesFilter(i.state, key)) counts[key] += 1;
    }
  }
  return counts;
}

export function sortByUpdatedDesc(intents: readonly IntentSummary[]): IntentSummary[] {
  return [...intents].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

// Human-relative age. Clamps future stamps (clock skew between the node and this
// box) to "just now" so the column never shows a negative or absurd age.
export function relativeTime(atMs: number, nowMs: number): string {
  const diff = nowMs - atMs;
  if (diff < 10_000) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function truncateId(id: string, head = 11): string {
  return id.length > head ? `${id.slice(0, head)}…` : id;
}

export function truncateHash(hash: string, head = 4): string {
  return hash.length > head ? `${hash.slice(0, head)}…` : hash;
}

// Group the integer part with thousands separators while leaving any decimal
// fraction intact. A value that isn't a plain decimal is returned untouched so
// the table never silently mangles an unexpected amount.
export function formatAmount(amount: string): string {
  const m = /^(\d+)(\.\d+)?$/.exec(amount);
  if (!m) return amount;
  const grouped = (m[1] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return m[2] ? `${grouped}${m[2]}` : grouped;
}
