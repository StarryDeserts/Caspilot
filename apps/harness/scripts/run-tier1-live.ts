/**
 * The single live-path composer for the Tier-1 demo. Given a set of injected
 * network/fs seams, it runs the whole sequence end to end — dry-plan pre-flight
 * → orchestration input → real config → live deps → {@link buildLiveTier1Ops} →
 * {@link orchestrateTier1} → {@link assembleTier1Artifacts} — and writes the
 * sealed, schema-valid artifact.
 *
 * Every boundary (signer, broadcaster, reader, wasm read, artifact write) is a
 * seam so the offline suite drives the REAL builder + dispatch + orchestration +
 * sealing with zero network, while the gated `[live]` test supplies the
 * casper-test-backed handles. This indirection exists because the tsx `main()`
 * entrypoints cannot import casper-js-sdk's named value exports under node's ESM
 * lexer (the SDK ships a webpack-CJS bundle); the live run therefore executes
 * through vitest, which resolves the CJS interop correctly.
 *
 * Refuses to run unless the plan is REAL mode (`RUN_REAL_ONCHAIN=1`): no seam is
 * touched on a dry plan, so importing this module can never broadcast by
 * accident. casper-test only, never mainnet.
 */
import type { RawSigner } from '@caspilot/signer-guard';
import { type TierOneArtifacts } from '../src/schema.js';
import {
  type Tier1Broadcaster,
  type Tier1Reader,
  buildLiveTier1Ops,
} from '../src/live-tier1-ops.js';
import { orchestrateTier1 } from '../src/orchestrate-tier1.js';
import { assembleTier1Artifacts } from './dump-tier1-artifacts.js';
import {
  type Tier1RealConfig,
  assembleTier1LiveDeps,
  buildRunTier1Plan,
  buildTier1RealConfig,
  tier1InputFromPlan,
} from './run-tier1.js';

/**
 * The injected effects {@link runTier1Live} needs. `loadSigner`, `makeBroadcaster`,
 * and `makeReader` receive the parsed {@link Tier1RealConfig} so the live handles
 * can read the rpc/key path/algorithm without re-parsing env; `readWasm` and
 * `writeArtifacts` are the only filesystem touches.
 */
export interface RunTier1LiveSeams {
  env: Record<string, string | undefined>;
  now: () => number;
  loadSigner: (config: Tier1RealConfig) => RawSigner;
  makeBroadcaster: (config: Tier1RealConfig) => Tier1Broadcaster;
  makeReader: (config: Tier1RealConfig) => Tier1Reader;
  readWasm: (path: string) => Uint8Array;
  writeArtifacts: (json: string) => void;
}

export async function runTier1Live(seams: RunTier1LiveSeams): Promise<TierOneArtifacts> {
  // Pre-flight: re-apply every vault guard offline. A dry plan must never reach a
  // live seam, so we bail before loading the signer or building any deploy.
  const plan = buildRunTier1Plan({ env: seams.env });
  if (plan.mode !== 'real') {
    throw new Error(
      'runTier1Live requires RUN_REAL_ONCHAIN=1 (real mode); refusing to run a dry plan live',
    );
  }

  const input = tier1InputFromPlan(plan);
  const config = buildTier1RealConfig({ env: seams.env, now: seams.now });
  const signer = seams.loadSigner(config);
  const broadcaster = seams.makeBroadcaster(config);
  const reader = seams.makeReader(config);
  const deps = assembleTier1LiveDeps({
    config,
    signer,
    broadcaster,
    reader,
    readWasm: seams.readWasm,
  });

  const events = await orchestrateTier1(input, buildLiveTier1Ops(deps));

  // A Tier-1 artifact describes one chain, so network and chainspec are the same
  // configured chain name; assembleTier1Artifacts fails loudly if they diverge.
  const artifacts = assembleTier1Artifacts({
    now: seams.now(),
    network: config.chainName,
    chainspec: config.chainName,
    vault: events.vault,
    paySuccess: events.paySuccess,
    rejections: events.rejections,
    ...(seams.env.DEMO_NOTES ? { notes: seams.env.DEMO_NOTES } : {}),
  });

  seams.writeArtifacts(JSON.stringify(artifacts, null, 2));
  return artifacts;
}
