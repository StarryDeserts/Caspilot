'use client';
import { useRef, type ReactNode } from 'react';
import { ClickProvider, useClickRef } from '@make-software/csprclick-ui';
import {
  CONTENT_MODE,
  WALLET_KEYS,
  type CsprClickInitOptions,
} from '@make-software/csprclick-core-types';
import { WalletProvider } from '../lib/wallet-context.js';
import { makeClickAdapter, type ClickRefLike } from '../lib/click-adapter.js';
import type { ClickProvider as ClickProviderSeam } from '../lib/wallet.js';

// The ONE module that statically imports the CSPR.click SDK. It is only ever loaded
// on the client (via the dynamic ssr:false import in CsprClickWallet), so the SDK's
// window-touching internals never run during SSR.

const APP_ID = process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID ?? '';

// IFRAME content mode keeps the SDK's coordination surface headless — we drive the
// Casper Wallet extension directly via connect()/send() and render our own topbar,
// so no CSPR.click <ClickUI> chrome is mounted. casper-test is pinned here.
const clickOptions: CsprClickInitOptions = {
  appName: 'Caspilot',
  appId: APP_ID,
  contentMode: CONTENT_MODE.IFRAME,
  providers: [WALLET_KEYS.CASPER_WALLET],
  chainName: 'casper-test',
};

// csprclick-ui@2.1.0 types useClickRef() as core-types' ICSPRClickSDK, which omits
// getProviderInstance — but the runtime SDK (CDN 2.1) implements it (it's the pop-free
// provider init connect()/sign() use internally). Declare the present-at-runtime method
// so the bridge can call it to fix signing on a storage-restored session.
type ClickRefWithProviderInit = ReturnType<typeof useClickRef> & {
  getProviderInstance(providerName: string): Promise<unknown>;
};

// Bridges the SDK's useClickRef() onto our injectable ClickProvider seam. The adapter
// is built ONCE around a ref that always points at the latest clickRef, so a ref that
// is null on first render and populates after SDK init still works — without forcing
// WalletProvider (which constructs its guarded ClickWallet exactly once) to remount.
function ClickBridge({ children }: { children: ReactNode }) {
  const clickRef = useClickRef();
  const latest = useRef<ReturnType<typeof useClickRef> | null>(clickRef);
  latest.current = clickRef;

  const adapterRef = useRef<ClickProviderSeam | null>(null);
  if (adapterRef.current === null) {
    const refLike: ClickRefLike = {
      getActiveAccount: () => latest.current?.getActiveAccount() ?? null,
      // Pop-free, idempotent init of the SDK's send-provider. The adapter calls this
      // before every send() so a session restored from storage (account present,
      // provider not yet initialized) can still sign instead of crashing the SDK.
      getProviderInstance: (providerName) =>
        latest.current
          ? (latest.current as ClickRefWithProviderInit).getProviderInstance(providerName)
          : Promise.reject(new Error('CSPR.click SDK not ready')),
      connect: (provider, options) =>
        latest.current
          ? latest.current.connect(provider, options)
          : Promise.reject(new Error('CSPR.click SDK not ready')),
      send: (txJson, signerPk, onStatus, timeout) =>
        latest.current
          ? latest.current.send(
              txJson,
              signerPk,
              (status, data) => {
                // Browser-only diagnostics: the SDK opens a websocket and reports live
                // sign → broadcast → process status here. Logging it lets a USER smoke
                // test pinpoint where the popup or broadcast fails, since WSL2 blocks
                // driving the wallet extension from automated tests.
                console.info('[CSPR.click send]', status, data);
                // Forward to the adapter so it can hand off the moment the broadcast
                // hash arrives (status `sent`) instead of awaiting the 120s socket.
                onStatus?.(status, data);
              },
              timeout,
            )
          : Promise.reject(new Error('CSPR.click SDK not ready')),
    };
    adapterRef.current = makeClickAdapter(refLike);
  }

  return <WalletProvider provider={adapterRef.current}>{children}</WalletProvider>;
}

export function LiveClickProvider({ children }: { children: ReactNode }) {
  return (
    <ClickProvider options={clickOptions}>
      <ClickBridge>{children}</ClickBridge>
    </ClickProvider>
  );
}
