import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalDevSigner } from '../src/local-dev-signer.js';

export interface DeployVaultPlan {
  mode: 'dry' | 'real';
  rpc: string;
  expectedChainspec: string;
  wasmPath?: string;
  signerKeyPath: string;
  generatedAtMs: number;
}

export function buildDeployVaultPlan(input: {
  env: Record<string, string | undefined>;
  now: () => number;
}): DeployVaultPlan {
  const { env, now } = input;
  if (!env.CASPER_NODE_RPC) throw new Error('CASPER_NODE_RPC is required');
  if (!env.CASPER_CHAINSPEC) throw new Error('CASPER_CHAINSPEC is required');
  if (!env.LOCAL_SIGNER_PRIVATE_KEY_PATH) throw new Error('LOCAL_SIGNER_PRIVATE_KEY_PATH is required');
  const mode: 'dry' | 'real' = env.RUN_REAL_ONCHAIN === '1' ? 'real' : 'dry';
  if (mode === 'real' && !env.VAULT_WASM_PATH) {
    throw new Error('VAULT_WASM_PATH is required when RUN_REAL_ONCHAIN=1');
  }
  const plan: DeployVaultPlan = {
    mode,
    rpc: env.CASPER_NODE_RPC,
    expectedChainspec: env.CASPER_CHAINSPEC,
    signerKeyPath: env.LOCAL_SIGNER_PRIVATE_KEY_PATH,
    generatedAtMs: now(),
  };
  if (env.VAULT_WASM_PATH) plan.wasmPath = env.VAULT_WASM_PATH;
  return plan;
}

async function main(): Promise<void> {
  const plan = buildDeployVaultPlan({ env: process.env, now: () => Date.now() });
  // Loading the signer also runs the file-only guards on the key path early.
  const signer = loadLocalDevSigner({ pemPath: plan.signerKeyPath });
  const out = resolve(process.cwd(), '.demo');
  mkdirSync(out, { recursive: true });
  if (plan.mode === 'dry') {
    writeFileSync(`${out}/deploy-vault.plan.json`, JSON.stringify({ ...plan, signerRole: signer.signerRole }, null, 2));
    console.log(`[deploy-vault] DRY plan written to ${out}/deploy-vault.plan.json`);
    return;
  }
  // REAL mode (RUN_REAL_ONCHAIN=1): a PolicyVault deploy is a WASM ModuleBytes
  // *session* deploy. The write path exists — loadLocalDevSigner signs the
  // deploy hash and CasperDeployAdapter.submitSignedDeploy broadcasts a
  // byte-identical re-validated deploy — but buildContractCallDeploy only
  // assembles StoredContractByHash *contract calls*, not ModuleBytes session
  // deploys. Wiring a real vault deployment needs a session-WASM deploy builder
  // (tracked follow-up). Until that exists we refuse loudly rather than fake a
  // broadcast; casper-test only, never mainnet, when it lands.
  throw new Error(
    'REAL vault deploy is not wired: needs a ModuleBytes session-WASM deploy builder feeding ' +
      'CasperDeployAdapter.submitSignedDeploy. Run without RUN_REAL_ONCHAIN=1 for the dry plan.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
