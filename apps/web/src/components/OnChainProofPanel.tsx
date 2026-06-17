import { CopyButton } from './CopyButton.js';

// The chain is the source of truth, so when a deploy hash exists we surface it
// verbatim and link out to the public testnet explorer rather than restating
// block/finality numbers we cannot independently vouch for. No hash yet → an
// honest pending card. (Whole app is casper-test only, hence the fixed host.)
const EXPLORER = 'https://testnet.cspr.live/deploy';

export function OnChainProofPanel({ deployHash }: { deployHash?: string | undefined }) {
  return (
    <div className="panel">
      <span className="panel-corner">on-chain proof</span>
      <h3>On-chain proof</h3>
      {deployHash ? (
        <div className="proof verified">
          <div className="proof-head">
            <span className="proof-title">deploy</span>
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
            href={`${EXPLORER}/${deployHash}`}
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
            <span className="proof-title">deploy</span>
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
