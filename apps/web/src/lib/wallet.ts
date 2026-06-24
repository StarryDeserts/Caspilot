export interface ClickAccount {
  publicKey: string;
}

// Normalized shape of the CSPR.click SDK's SendResult. `send` signs (wallet popup)
// AND broadcasts via CSPR.click's node proxy in one call; on success it yields the
// real on-chain hash. A Casper 2.0 native transfer resolves as a TransactionV1 and
// reports transactionHash (canonical, deployHash null); a legacy Deploy reports
// deployHash (transactionHash null). They are kept DISTINCT — never cross-filled —
// so the view can prefer the canonical hash and link the correct cspr.live URL kind.
// A user cancel yields cancelled=true with no hash; a broadcast failure yields a
// non-null error with no hash.
export interface ClickSendResult {
  deployHash: string | null;
  transactionHash: string | null;
  cancelled: boolean;
  error: string | null;
  status: string | null;
}

export interface ClickProvider {
  connect(): Promise<ClickAccount>;
  send(input: { txJson: object; signerPk: string }): Promise<ClickSendResult>;
}

export class ClickWallet {
  private readonly provider: ClickProvider;

  constructor(provider: ClickProvider) {
    if (!provider) {
      throw new Error('CSPR.click provider missing — install the browser SDK and inject it');
    }
    for (const k of Object.keys(provider as object)) {
      if (k.includes('CSPR_CLOUD_KEY') || k.includes('PRIVATE_KEY')) {
        throw new Error(
          `CSPR.click provider exposes forbidden field "${k}" — frontend must not see privileged secrets`,
        );
      }
    }
    this.provider = provider;
  }

  connect(): Promise<ClickAccount> {
    return this.provider.connect();
  }

  send(input: { txJson: object; signerPk: string }): Promise<ClickSendResult> {
    return this.provider.send(input);
  }
}
