// x402 settlement happens agent-side via the facilitator, not from this UI, so
// this panel is informational: it only appears while the intent actually sits
// in PAYMENT_REQUIRED and states what is owed. No "pay" button — the frontend
// client has no wired pay path, and a dead/faked button would be dishonest.
export function X402PaymentPanel({
  state,
  amount,
  token,
}: {
  state?: string | undefined;
  amount?: string | undefined;
  token?: string | undefined;
}) {
  if (state !== 'PAYMENT_REQUIRED') return null;
  return (
    <div className="panel">
      <h3>x402 · Payment</h3>
      <div className="pay-card">
        <div className="pay-head">
          <span className="ttl">402 Payment Required</span>
          <span className="badge payment">
            <span className="bdot" />
            PAYMENT
          </span>
        </div>
        <p className="pay-desc">
          The receiver returned a 402. The agent settles the facilitator invoice and verifies it
          before submit — this view is read-only.
        </p>
        <div className="pay-row">
          <span className="k">amount due</span>
          <span className="v">
            {amount ?? '—'} {token ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}
