import { CopyButton } from './CopyButton.js';

// The chain is the source of truth, so when a hash exists we surface it verbatim
// and link out to the public testnet explorer rather than restating block/finality
// numbers we cannot independently vouch for. No hash yet → an honest pending card.
// (Whole app is casper-test only, hence the fixed host.) The kind — chain-resolved
// by confirm-onchain, never client-supplied — selects the explorer path: a Casper
// 2.0 TransactionV1 lives at /transaction/<hash>, a legacy Deploy at /deploy/<hash>.
const EXPLORER_HOST = 'https://testnet.cspr.live';

export function OnChainProofPanel({
  deployHash,
  kind,
}: {
  deployHash?: string | undefined;
  kind?: 'deploy' | 'transaction' | undefined;
}) {
  const label = kind === 'transaction' ? 'transaction' : 'deploy';
  return (
    <div className="panel">
      <span className="panel-corner">on-chain proof</span>
      <h3>On-chain proof</h3>
      {deployHash ? (
        <div className="proof verified">
          <div className="proof-head">
            <span className="proof-title">{label}</span>
            <span className="proof-status">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12l5 5 9-11" />
              </svg>
              VERIFIED
            </span>
          </div>
          <div className="proof-hash">
            <span className="hx">{deployHash}</span>
            <CopyButton text={deployHash} />
          </div>
          <a
            className="proof-link"
            href={`${EXPLORER_HOST}/${label}/${deployHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on testnet.cspr.live
            <svg viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        </div>
      ) : (
        <div className="proof pending">
          <div className="proof-head">
            <span className="proof-title">{label}</span>
            <span className="proof-status">
              <span className="mini-spin" aria-hidden="true" />
              PENDING
            </span>
          </div>
          <p className="pay-desc" style={{ margin: 0 }}>
            awaiting broadcast on casper-test
          </p>
        </div>
      )}
    </div>
  );
}
