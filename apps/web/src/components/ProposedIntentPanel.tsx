import { Fragment } from 'react';
import type { IntentBody } from '../lib/intent-view.js';

// The agent's proposed transfer, shown in full so a reviewer can verify the
// receiver/contract before authorizing. Values are never truncated (the .kv dd
// wraps with break-all); a missing body renders em-dashes rather than blanks.
const FIELDS: (keyof IntentBody)[] = [
  'agent',
  'receiver',
  'token',
  'contract',
  'network',
  'amount',
];

export function ProposedIntentPanel({ body }: { body?: IntentBody | undefined }) {
  return (
    <div className="panel">
      <span className="panel-corner">env casper-test</span>
      <h3>Proposed intent</h3>
      <dl className="kv">
        {FIELDS.map((f) => (
          <Fragment key={f}>
            <dt>{f}</dt>
            <dd>{body?.[f] ?? '—'}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
