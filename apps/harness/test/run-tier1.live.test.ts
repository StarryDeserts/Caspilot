import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import {
  CasperDeployAdapter,
  CasperStateReader,
  makeRpcEntityClient,
  type DeployFinalization,
} from '@caspilot/adapters';
import type { RawSigner } from '@caspilot/signer-guard';
import { TierOneArtifactsSchema } from '../src/schema.js';
import type { Tier1Broadcaster, Tier1Reader } from '../src/live-tier1-ops.js';
import { loadLocalDevSigner } from '../src/local-dev-signer.js';
import { runTier1Live, type RunTier1LiveSeams } from '../scripts/run-tier1-live.js';

// runTier1Live composes the whole live Tier-1 path: dry-plan pre-flight → orchestration
// input → real config → live deps → buildLiveTier1Ops → orchestrateTier1 → assemble +
// seal artifacts. The offline suite drives it through INJECTED network/fs seams (signer,
// broadcaster, reader, readWasm, writeArtifacts) so the real builder + dispatch +
// orchestration + sealing all run, end-to-end, with zero network. The byte encoding behind
// each deploy is the SDK's job, proven by the gated `[live]` test against a casper-test node.

const FIXED_NOW = 1_700_000_000_000;
const CEP18_PKG = 'a'.repeat(64);
const VAULT_PKG = 'b'.repeat(64);
const VAULT_ENTITY = 'f'.repeat(64);
const RECEIVER = `00${'cc'.repeat(32)}`;
const BLOCKED = `00${'dd'.repeat(32)}`;

/** Full real-mode env: the dry baseEnv plus install-fresh CEP-18 + WASM paths. */
function realEnv(): Record<string, string> {
  return {
    CASPER_NODE_RPC: 'http://node:7777/rpc',
    CASPER_CHAINSPEC: 'casper-test',
    LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k.pem',
    CEP18_CONTRACT_HASH: CEP18_PKG,
    DEMO_AGENT_HASH: `00${'bb'.repeat(32)}`,
    DEMO_RECEIVER_HASH: RECEIVER,
    DEMO_BLOCKED_RECEIVER_HASH: BLOCKED,
    DEMO_MAX_SINGLE: '100',
    DEMO_DAILY_LIMIT: '500',
    DEMO_PAY_AMOUNT: '50',
    DEMO_REJECTION_AMOUNT: '999',
    VAULT_WASM_PATH: '/tmp/vault.wasm',
    CEP18_WASM_PATH: '/tmp/cep18.wasm',
    RUN_REAL_ONCHAIN: '1',
  };
}

/** A real secp256k1 pk so the live deploy builder + deriveAgentKey are well-formed offline. */
function fakeSigner(signCount: { n: number }): RawSigner {
  const signerPk = PrivateKey.generate(KeyAlgorithm.SECP256K1).publicKey.toHex(false);
  return {
    signerRole: 'local_dev',
    signerPk,
    async sign() {
      signCount.n += 1;
      return { signatureHex: 'ab'.repeat(33) };
    },
  };
}

/**
 * The orchestrator dispatches 8 deploys in a fixed order: installCep18, installVault,
 * allowAgent, allowReceiver, fundVault, the accepted pay, then the two rejections. Setup
 * + accepted pay finalize as success; the rejections revert with the PolicyVault codes the
 * demo asserts (ReceiverNotAllowed=3, then AmountAboveMax=4). Deploy hashes are sequential
 * 64-hex so the sealed artifact is schema-valid.
 */
function scriptedBroadcaster(submits: { n: number }): Tier1Broadcaster {
  const finals: DeployFinalization[] = [
    { finalizedHeight: 10, success: true }, // installCep18
    { finalizedHeight: 11, success: true }, // installVault
    { finalizedHeight: 12, success: true }, // allowAgent
    { finalizedHeight: 13, success: true }, // allowReceiver
    { finalizedHeight: 14, success: true }, // fundVault
    { finalizedHeight: 20, success: true }, // accepted pay
    { finalizedHeight: 21, success: false, errorCode: 3 }, // receiver_not_allowed
    { finalizedHeight: 22, success: false, errorCode: 4 }, // over_max_single_payment
  ];
  let i = 0;
  return {
    async submitSignedDeploy() {
      submits.n += 1;
      return { deployHash: submits.n.toString(16).padStart(64, '0') };
    },
    async awaitDeployFinalized() {
      const f = finals[i];
      if (!f) throw new Error('unexpected extra deploy beyond the scripted Tier-1 sequence');
      i += 1;
      return f;
    },
  };
}

function fakeReader(): Tier1Reader {
  return {
    async readDeployerNamedKeys() {
      return [
        { name: 'Cep18', key: `hash-${CEP18_PKG}` },
        { name: 'PolicyVault', key: `hash-${VAULT_PKG}` },
      ];
    },
    async latestPackageEntityHash() {
      return VAULT_ENTITY;
    },
  };
}

function offlineSeams(
  envOverrides: Record<string, string | undefined> = {},
): {
  seams: RunTier1LiveSeams;
  written: string[];
  submits: { n: number };
  signs: { n: number };
} {
  const written: string[] = [];
  const submits = { n: 0 };
  const signs = { n: 0 };
  const env = { ...realEnv(), ...envOverrides };
  const seams: RunTier1LiveSeams = {
    env,
    now: () => FIXED_NOW,
    loadSigner: () => fakeSigner(signs),
    makeBroadcaster: () => scriptedBroadcaster(submits),
    makeReader: () => fakeReader(),
    readWasm: () => new Uint8Array([1, 2, 3]),
    writeArtifacts: (json) => {
      written.push(json);
    },
  };
  return { seams, written, submits, signs };
}

describe('runTier1Live (offline integration)', () => {
  it('runs the composed live sequence and seals a schema-valid tier1-artifacts', async () => {
    const { seams, written, submits, signs } = offlineSeams();

    const artifacts = await runTier1Live(seams);

    // It actually drove the real builder + dispatch: 8 deploys signed + submitted.
    expect(submits.n).toBe(8);
    expect(signs.n).toBe(8);

    // The sealed JSON parses + validates against the Tier-1 schema.
    expect(written).toHaveLength(1);
    const sealed = TierOneArtifactsSchema.parse(JSON.parse(written[0]!));
    expect(sealed).toEqual(artifacts);

    // Single chain, stamped with the injected clock.
    expect(artifacts.network).toBe('casper-test');
    expect(artifacts.chainspec).toBe('casper-test');
    expect(artifacts.generatedAtMs).toBe(FIXED_NOW);

    // The vault identity is the recovered entity hash; the accepted pay is recorded.
    expect(artifacts.vault.contractHash).toBe(VAULT_ENTITY);
    expect(artifacts.vault.finalizedHeight).toBe(11);
    expect(artifacts.paySuccess.receiver).toBe(RECEIVER);
    expect(artifacts.paySuccess.amount).toBe('50');
    expect(artifacts.paySuccess.finalizedHeight).toBe(20);

    // Both real on-chain rejections, with their PolicyVault codes.
    expect(artifacts.rejections).toEqual([
      expect.objectContaining({ kind: 'receiver_not_allowed', errorCode: 3, finalizedHeight: 21 }),
      expect.objectContaining({
        kind: 'over_max_single_payment',
        errorCode: 4,
        finalizedHeight: 22,
      }),
    ]);
  });

  it('threads DEMO_NOTES into the sealed artifact when present', async () => {
    const { seams } = offlineSeams({ DEMO_NOTES: 'real casper-test Tier-1 run' });
    const artifacts = await runTier1Live(seams);
    expect(artifacts.notes).toBe('real casper-test Tier-1 run');
  });

  it('refuses to run (and touches no network) when RUN_REAL_ONCHAIN is not set', async () => {
    const written: string[] = [];
    let touched = false;
    const env = { ...realEnv() };
    delete (env as Record<string, string | undefined>).RUN_REAL_ONCHAIN;
    const boom = () => {
      touched = true;
      throw new Error('network/fs must not be touched on a dry plan');
    };
    const seams: RunTier1LiveSeams = {
      env,
      now: () => FIXED_NOW,
      loadSigner: boom as unknown as RunTier1LiveSeams['loadSigner'],
      makeBroadcaster: boom as unknown as RunTier1LiveSeams['makeBroadcaster'],
      makeReader: boom as unknown as RunTier1LiveSeams['makeReader'],
      readWasm: boom as unknown as RunTier1LiveSeams['readWasm'],
      writeArtifacts: (json) => written.push(json),
    };

    await expect(runTier1Live(seams)).rejects.toThrow(/RUN_REAL_ONCHAIN|real/i);
    expect(touched).toBe(false);
    expect(written).toHaveLength(0);
  });
});

// The real run: only when explicitly opted in. Broadcasts to casper-test, awaits
// finalization for a real PolicyVault deploy + one accepted pay + two rejections, and
// seals apps/harness/.demo/tier1-artifacts.json. casper-test only, never mainnet.
describe('runTier1Live (live casper-test)', () => {
  it.skipIf(process.env.RUN_REAL_ONCHAIN !== '1')(
    'broadcasts the real Tier-1 sequence and seals tier1-artifacts.json',
    async () => {
      const demoDir = resolve(process.cwd(), '.demo');
      const seams: RunTier1LiveSeams = {
        env: process.env,
        now: () => Date.now(),
        loadSigner: (config) =>
          loadLocalDevSigner({ pemPath: config.signerKeyPath, algorithm: config.signerAlgorithm }),
        makeBroadcaster: (config) => new CasperDeployAdapter({ url: config.rpc }),
        makeReader: (config) => new CasperStateReader(makeRpcEntityClient({ url: config.rpc })),
        readWasm: (path) => readFileSync(path),
        writeArtifacts: (json) => {
          mkdirSync(demoDir, { recursive: true });
          writeFileSync(`${demoDir}/tier1-artifacts.json`, json);
        },
      };

      const artifacts = await runTier1Live(seams);

      const reloaded = TierOneArtifactsSchema.parse(
        JSON.parse(readFileSync(`${demoDir}/tier1-artifacts.json`, 'utf8')),
      );
      expect(reloaded).toEqual(artifacts);
      expect(/^[0-9a-f]{64}$/.test(artifacts.vault.contractHash)).toBe(true);
      expect(artifacts.paySuccess.finalizedHeight).toBeGreaterThan(0);
      expect(artifacts.rejections.length).toBeGreaterThanOrEqual(1);
      expect(artifacts.rejections.some((r) => r.kind === 'receiver_not_allowed')).toBe(true);
    },
    600_000,
  );
});
