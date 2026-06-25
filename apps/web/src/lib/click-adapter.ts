import type { ClickAccount, ClickProvider, ClickSendResult } from './wallet.js';

// The canonical CSPR.click provider key for the Casper Wallet browser extension.
export const CASPER_WALLET_KEY = 'casper-wallet';

// The minimal slice of the CSPR.click SDK (ICSPRClickSDK) this adapter consumes.
// Declared structurally so the real `clickRef` from useClickRef() satisfies it,
// and tests inject a fake without standing up the whole 40-method SDK surface.
export interface ClickRefLike {
  getActiveAccount(): { public_key: string } | null;
  connect(withProvider: string, options?: unknown): Promise<{ public_key: string } | undefined>;
  // The SDK's send() dereferences an internal `this.provider` that is populated
  // ONLY by connect()/sign() (both call getProviderInstance). A session restored
  // from storage via getActiveAccount() yields an active account but leaves that
  // provider uninitialized, so send() rejects with a TypeError before it can pop
  // the wallet. getProviderInstance is the SDK's own pop-free, idempotent primitive
  // for initializing it; the adapter calls it ahead of every send as a guard.
  getProviderInstance(providerName: string): Promise<unknown>;
  // The real SDK send is `send(deployJson, signingPublicKey, onStatus?, timeout?)`.
  // It pops the wallet, broadcasts, then fires `onStatus('sent', {...result})` with
  // the broadcast hash the INSTANT signing completes — BEFORE it opens a CSPR.cloud
  // streaming socket and blocks up to `timeout` (default 120) seconds waiting for
  // finality. The adapter threads `onStatus` so it can hand the hash off the moment
  // it arrives instead of awaiting that socket (our backend verifies finality
  // independently). `timeout` is forwarded but the early hand-off makes it moot.
  send(
    txJson: string | object,
    signerPk: string,
    onStatus?: (status: string, data?: SdkSendResult) => void,
    timeout?: number,
  ): Promise<SdkSendResult | undefined>;
}

interface SdkSendResult {
  cancelled: boolean;
  deployHash: string | null;
  transactionHash: string | null;
  status: string | null;
  error: string | null;
}

// Map the SDK's SendResult (or an undefined no-result) onto the ClickProvider seam.
// deployHash and transactionHash stay DISTINCT — never cross-filled — so a V1 native
// transfer (transactionHash set, deployHash null) links /transaction/ downstream, and
// an undefined result surfaces as an honest error rather than a silent success.
function normalizeSendResult(res: SdkSendResult | undefined): ClickSendResult {
  if (!res) {
    return {
      deployHash: null,
      transactionHash: null,
      cancelled: false,
      error: 'wallet returned no send result',
      status: null,
    };
  }
  return {
    deployHash: res.deployHash ?? null,
    transactionHash: res.transactionHash ?? null,
    cancelled: Boolean(res.cancelled),
    error: res.error ?? null,
    status: res.status ?? null,
  };
}

// Bridges the real CSPR.click SDK instance onto the injectable ClickProvider seam
// the WalletProvider consumes. Pure mapping — no React, no window — so the risky
// account/SendResult normalization is unit-tested in jsdom while the SDK React
// glue (useClickRef + ClickProvider mount) stays in the browser-only wrapper.
export function makeClickAdapter(clickRef: ClickRefLike): ClickProvider {
  return {
    async connect(): Promise<ClickAccount> {
      // An existing session resolves without re-popping the wallet; otherwise pop
      // the Casper Wallet extension directly (no provider-chooser modal needed).
      const account = clickRef.getActiveAccount() ?? (await clickRef.connect(CASPER_WALLET_KEY));
      if (!account) {
        throw new Error('CSPR.click connect returned no account — cancelled or wallet unavailable');
      }
      return { publicKey: account.public_key };
    },
    async send({ txJson, signerPk }): Promise<ClickSendResult> {
      // Guard the restored-session crash: the SDK's send() dereferences an internal
      // provider that connect()/sign() populate but a storage-restored session does
      // not. Initialize it (pop-free, idempotent) before sending, or send() rejects
      // with a TypeError before the wallet can ever pop.
      await clickRef.getProviderInstance(CASPER_WALLET_KEY);

      // Hand off the instant the broadcast hash arrives — don't await the streaming
      // socket. The SDK fires onStatus('sent', {...}) carrying the hash right after
      // signing, THEN blocks up to 120s on a CSPR.cloud socket whose finality verdict
      // we discard (our backend re-verifies on-chain independently). So resolve on the
      // first hash-bearing status update; otherwise fall back to the settled promise
      // (which carries cancelled/error/no-hash outcomes). A `settled` latch makes the
      // race single-shot, and onStatus ignores cancelled/error updates so those map
      // from the promise — never as a spurious early success.
      return new Promise<ClickSendResult>((resolve, reject) => {
        let settled = false;

        const onStatus = (_status: string, data?: SdkSendResult) => {
          if (settled || !data || data.cancelled || data.error) return;
          if (data.transactionHash || data.deployHash) {
            settled = true;
            resolve(normalizeSendResult(data));
          }
        };

        // The SDK requires signingPublicKey to EXACTLY match the active account's
        // public_key lowercased, or send() rejects without ever popping the wallet.
        clickRef.send(txJson, signerPk.toLowerCase(), onStatus).then(
          (res) => {
            if (settled) return;
            settled = true;
            resolve(normalizeSendResult(res));
          },
          (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          },
        );
      });
    },
  };
}
