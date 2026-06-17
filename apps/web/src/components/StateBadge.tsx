// §6 FSM(12) → 6 semantic badge buckets. The buckets drive color via
// design-system.css `.badge.{bucket}` classes; the raw FSM string is always
// rendered as the label so audit/trace consumers stay literal.
const BUCKET: Record<string, string> = {
  DRAFT: 'draft',
  POLICY_VALIDATED: 'validated',
  PAYMENT_REQUIRED: 'payment',
  PAYMENT_VERIFIED: 'inflight',
  READY_TO_SUBMIT: 'inflight',
  SIGNED_RECEIVED: 'inflight',
  ACCEPTED_BY_NODE: 'inflight',
  EXECUTED: 'executed',
  FINALIZED: 'executed',
  REJECTED: 'failed',
  EXECUTION_FAILED: 'failed',
  TIMEOUT: 'failed',
};

export function StateBadge({ state, size }: { state: string; size?: 'lg' }) {
  const bucket = BUCKET[state] ?? 'draft';
  return (
    <span className={`badge ${bucket}${size === 'lg' ? ' lg' : ''}`}>
      <span className="bdot" />
      {state}
    </span>
  );
}
