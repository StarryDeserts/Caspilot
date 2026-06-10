const TONE: Record<string, string> = {
  DRAFT: 'bg-zinc-700 text-zinc-100',
  POLICY_VALIDATED: 'bg-blue-700 text-blue-50',
  PAYMENT_REQUIRED: 'bg-amber-700 text-amber-50',
  PAYMENT_VERIFIED: 'bg-amber-600 text-amber-50',
  READY_TO_SUBMIT: 'bg-indigo-700 text-indigo-50',
  SIGNED_RECEIVED: 'bg-indigo-600 text-indigo-50',
  ACCEPTED_BY_NODE: 'bg-indigo-500 text-indigo-50',
  EXECUTED: 'bg-emerald-600 text-emerald-50',
  FINALIZED: 'bg-green-600 text-green-50',
  EXECUTION_FAILED: 'bg-red-700 text-red-50',
  REJECTED: 'bg-red-800 text-red-50',
  TIMEOUT: 'bg-zinc-600 text-zinc-50',
};

export function StateBadge({ state }: { state: string }) {
  const tone = TONE[state] ?? 'bg-zinc-700 text-zinc-100';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs ${tone}`}>{state}</span>;
}
