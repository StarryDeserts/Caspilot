export interface WalletAccountView {
  ref: string;
}

export function WalletButton({
  account,
  onClick,
}: {
  account?: WalletAccountView | null;
  onClick?: (() => void) | undefined;
}) {
  if (!account) {
    return (
      <button type="button" className="wallet-btn idle" onClick={onClick}>
        Connect CSPR.click
      </button>
    );
  }
  return (
    <button type="button" className="wallet-btn connected" onClick={onClick}>
      <span className="key-dot" />
      {account.ref}
      <svg className="caret" viewBox="0 0 24 24" fill="none" strokeWidth={2} aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
