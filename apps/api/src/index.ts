import { serve } from '@hono/node-server';
import { CasperDeployAdapter } from '@caspilot/adapters';
import { buildApp } from './server.js';
import { buildApiDeps, nativeDemoPolicy, type ApiDepsConfig } from './deps.js';

const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';
// Persist the ledger/audit SQLite to a file so intent state survives restarts.
// Point CASPILOT_DB_PATH at a mounted volume in production.
const dbPath = process.env.CASPILOT_DB_PATH ?? './caspilot.db';

// The CSPR.click co-sign path needs a Casper node to INDEPENDENTLY verify the
// user-broadcast deploy on-chain (info_get_deploy) before recording it. That is
// the only thing that requires an RPC URL, and it is the only thing that holds
// real network reach — so we gate the whole live path on CASPILOT_NODE_RPC_URL.
// Unset ⇒ pure-demo mode: the co-sign endpoints stay unmounted and operators use
// the mark-executed fast-forward, exactly like serve-demo. We never embed a
// CSPR.cloud key here; a plain node RPC URL is all the backend ever sees.
const nodeRpcUrl = process.env.CASPILOT_NODE_RPC_URL;
const liveDeploy: Pick<ApiDepsConfig, 'deployReader' | 'unsignedDeploy'> = nodeRpcUrl
  ? {
      deployReader: new CasperDeployAdapter({ url: nodeRpcUrl }),
      // chainName must match the network the wallet signs on — reuse the single
      // expectedChainspec so the deploy header and the gateway can't drift apart.
      unsignedDeploy: {
        chainName: expectedChainspec,
        paymentMotes: process.env.CASPILOT_PAYMENT_MOTES ?? '3000000000',
      },
    }
  : {};

// The live browser co-sign demo moves NATIVE CSPR (the user's wallet already
// holds testnet CSPR — no CEP-18 balance needed, so it can actually broadcast).
// Opt in by allowlisting exactly one receiver PublicKey via CASPILOT_NATIVE_RECEIVER;
// that swaps the default CEP-18 demo policy for a motes-denominated native one.
// Without it we keep DEFAULT_DEMO_POLICY (CEP-18), whose placeholder package does
// not exist on-chain — so live broadcast there would be rejected by design.
const nativeReceiver = process.env.CASPILOT_NATIVE_RECEIVER;
const policyConfig: Pick<ApiDepsConfig, 'policy'> = nativeReceiver
  ? { policy: nativeDemoPolicy(nativeReceiver) }
  : {};

const deps = buildApiDeps({ dbPath, ...liveDeploy, ...policyConfig });
const app = buildApp({ env: { expectedChainspec }, deps });
serve({ fetch: app.fetch, port });
console.log(
  `caspilot-api listening on :${port}` +
    (nodeRpcUrl ? ' (live on-chain co-sign enabled)' : ' (pure-demo mode — no node RPC configured)'),
);
