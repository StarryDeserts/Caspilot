import { Tooltip } from './Tooltip.js';
import { NetworkPill } from './NetworkPill.js';
import { HealthDot, type HealthStatus } from './HealthDot.js';
import { WalletButton, type WalletAccountView } from './WalletButton.js';

export function Topbar({
  network = 'casper:casper-test',
  health = 'healthy',
  account = null,
  onMenuToggle,
  onWalletClick,
}: {
  network?: string;
  health?: HealthStatus;
  account?: WalletAccountView | null;
  onMenuToggle?: () => void;
  onWalletClick?: () => void;
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Toggle navigation"
        onClick={onMenuToggle}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <Tooltip label="Testnet only">
        <NetworkPill network={network} />
      </Tooltip>
      <Tooltip label="API /healthz">
        <HealthDot status={health} />
      </Tooltip>
      <WalletButton account={account} onClick={onWalletClick} />
    </header>
  );
}
