import { describe, it, expect, vi } from 'vitest';
import { CLValue, PublicKey } from 'casper-js-sdk';
import type { DeployFinalization, NamedKeyEntry } from '@caspilot/adapters';
import type { RawSigner, UnsignedDeployEnvelope } from '@caspilot/signer-guard';
import type { Tier1ChainOps } from '../src/orchestrate-tier1.js';
import {
  buildLiveTier1Ops,
  makeLiveDeployBuilder,
  deriveAgentKey,
  keyStringFromTaggedAddress,
  contractKeyString,
  odraInstallArgs,
  type Tier1Broadcaster,
  type Tier1DeployBuilder,
  type Tier1LiveDeps,
  type Tier1Reader,
} from '../src/live-tier1-ops.js';

// Fully offline: signer, broadcaster, reader, and the deploy-builder seam are all
// injected. These tests pin buildLiveTier1Ops's *wiring* — which builder/entry
// point each op drives, the recovered-hash threading, the agent derived from the
// signer (never an env address), the sign→submit→await dispatch, and StepOutcome
// mapping. The exact CLType byte encoding behind each arg is the SDK's job, proven
// against a live casper-test node when scripts/run-tier1.ts runs for real.

const SIGNER_PK = `01${'a'.repeat(64)}`;
const CEP18_PKG = 'b'.repeat(64);
const VAULT_PKG = 'c'.repeat(64);
const VAULT_ENTITY = 'd'.repeat(64);
const RECEIVER = `00${'cc'.repeat(32)}`;

interface BuildCall {
  kind: 'installModule' | 'versionedCall';
  wasm?: Uint8Array;
  packageHash?: string;
  entryPoint?: string;
  argNames: string[];
  /** For installs: the Odra package-hash key-name value, so the test can pin it to the recovery name. */
  keyName?: string;
}

interface SubmitCall {
  envelope: UnsignedDeployEnvelope;
  signatureHex: string;
  signerPk: string;
}

function envFor(tag: string): UnsignedDeployEnvelope {
  return { headerJson: { tag }, bodyHashHex: tag, payloadHex: '' };
}

function recordingBuild(calls: BuildCall[]): Tier1DeployBuilder {
  let n = 0;
  return {
    installModule({ wasm, args }) {
      const call: BuildCall = { kind: 'installModule', wasm, argNames: Object.keys(args) };
      const keyArg = args.odra_cfg_package_hash_key_name;
      if (keyArg) call.keyName = keyArg.toString();
      calls.push(call);
      return envFor(`im-${n++}`);
    },
    versionedCall({ packageHash, entryPoint, args }) {
      calls.push({ kind: 'versionedCall', packageHash, entryPoint, argNames: Object.keys(args) });
      return envFor(`vc-${entryPoint}-${n++}`);
    },
  };
}

function recordingBroadcaster(opts: {
  submits: SubmitCall[];
  awaits: string[];
  finalize?: (deployHash: string) => DeployFinalization;
}): Tier1Broadcaster {
  return {
    async submitSignedDeploy(input) {
      opts.submits.push(input);
      return { deployHash: `dh:${input.envelope.bodyHashHex}` };
    },
    async awaitDeployFinalized(deployHash) {
      opts.awaits.push(deployHash);
      return (
        opts.finalize?.(deployHash) ?? { finalizedHeight: 100, success: true, hashKind: 'deploy' }
      );
    },
  };
}

function recordingReader(opts: {
  namedKeys?: NamedKeyEntry[];
  entityHash?: string;
  readCalls: string[];
  pkgCalls: string[];
}): Tier1Reader {
  return {
    async readDeployerNamedKeys(pk) {
      opts.readCalls.push(pk);
      return opts.namedKeys ?? [];
    },
    async latestPackageEntityHash(pkg) {
      opts.pkgCalls.push(pkg);
      return opts.entityHash ?? VAULT_ENTITY;
    },
  };
}

function harness(
  overrides: {
    namedKeys?: NamedKeyEntry[];
    finalize?: (deployHash: string) => DeployFinalization;
  } = {},
) {
  const builds: BuildCall[] = [];
  const submits: SubmitCall[] = [];
  const awaits: string[] = [];
  const readCalls: string[] = [];
  const pkgCalls: string[] = [];
  const signOpts: { finalize?: (deployHash: string) => DeployFinalization } = {};
  if (overrides.finalize) signOpts.finalize = overrides.finalize;

  const signer: RawSigner = {
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    sign: vi.fn(async () => ({ signatureHex: 'beef' })),
  };
  const readerOpts: Parameters<typeof recordingReader>[0] = { readCalls, pkgCalls };
  if (overrides.namedKeys) readerOpts.namedKeys = overrides.namedKeys;
  const deps: Tier1LiveDeps = {
    signer,
    broadcaster: recordingBroadcaster({ submits, awaits, ...signOpts }),
    reader: recordingReader(readerOpts),
    build: recordingBuild(builds),
    cep18: {
      wasm: new Uint8Array([1, 2, 3]),
      installArgs: {
        name: CLValue.newCLString('Demo'),
        symbol: CLValue.newCLString('DEMO'),
        decimals: CLValue.newCLUint8(9),
        total_supply: CLValue.newCLUInt256('1000000'),
      },
    },
    vault: {
      wasm: new Uint8Array([4, 5, 6]),
      maxSingle: '100',
      dailyLimit: '500',
      validUntilMs: 1893456000000,
    },
  };
  const ops: Tier1ChainOps = buildLiveTier1Ops(deps);
  return { ops, signer, builds, submits, awaits, readCalls, pkgCalls };
}

describe('buildLiveTier1Ops dispatch + wiring', () => {
  it('installCep18 builds a ModuleBytes install from the CEP-18 wasm + install args, then signs/submits/awaits', async () => {
    const h = harness();
    const out = await h.ops.installCep18();

    expect(h.builds[0]).toMatchObject({
      kind: 'installModule',
      wasm: new Uint8Array([1, 2, 3]),
      // Odra ModuleBytes install requires the three cfg args ahead of the ctor args;
      // the package-hash key-name must equal the name recoverPackageHash later looks up.
      argNames: [
        'odra_cfg_is_upgradable',
        'odra_cfg_allow_key_override',
        'odra_cfg_package_hash_key_name',
        'name',
        'symbol',
        'decimals',
        'total_supply',
      ],
      keyName: 'Cep18',
    });
    // The dispatch threads the built envelope through sign → submit → await.
    expect(h.signer.sign).toHaveBeenCalledTimes(1);
    expect(h.submits[0]).toMatchObject({ signatureHex: 'beef', signerPk: SIGNER_PK });
    expect(h.awaits[0]).toBe(`dh:${h.submits[0]!.envelope.bodyHashHex}`);
    expect(out).toEqual({ deployHash: 'dh:im-0', finalizedHeight: 100, success: true });
    expect('errorCode' in out).toBe(false);
  });

  it('recoverPackageHash reads the deployer named keys (by signer pk) and selects the package hash', async () => {
    const h = harness({ namedKeys: [{ name: 'Cep18', key: `hash-${CEP18_PKG}` }] });
    const hash = await h.ops.recoverPackageHash('Cep18');
    expect(hash).toBe(CEP18_PKG);
    expect(h.readCalls).toEqual([SIGNER_PK]);
  });

  it('installVault builds a ModuleBytes install carrying the PolicyVault init args', async () => {
    const h = harness();
    await h.ops.installVault({ cep18PackageHash: CEP18_PKG });
    expect(h.builds[0]).toMatchObject({
      kind: 'installModule',
      wasm: new Uint8Array([4, 5, 6]),
      argNames: [
        'odra_cfg_is_upgradable',
        'odra_cfg_allow_key_override',
        'odra_cfg_package_hash_key_name',
        'token_package',
        'max_single',
        'daily_limit',
        'valid_until_ms',
      ],
      keyName: 'PolicyVault',
    });
  });

  it('recoverVaultContractHash resolves the package’s latest entity hash via the reader', async () => {
    const h = harness();
    const entity = await h.ops.recoverVaultContractHash(VAULT_PKG);
    expect(entity).toBe(VAULT_ENTITY);
    expect(h.pkgCalls).toEqual([VAULT_PKG]);
  });

  it('allowAgent calls allow_agent on the vault package with a single agent arg', async () => {
    const h = harness();
    await h.ops.allowAgent({ vaultPackageHash: VAULT_PKG });
    expect(h.builds[0]).toEqual({
      kind: 'versionedCall',
      packageHash: VAULT_PKG,
      entryPoint: 'allow_agent',
      argNames: ['agent'],
    });
  });

  it('allowReceiver calls allow_receiver on the vault package with the receiver arg', async () => {
    const h = harness();
    await h.ops.allowReceiver({ vaultPackageHash: VAULT_PKG, receiver: RECEIVER });
    expect(h.builds[0]).toEqual({
      kind: 'versionedCall',
      packageHash: VAULT_PKG,
      entryPoint: 'allow_receiver',
      argNames: ['receiver'],
    });
  });

  it('fundVault calls CEP-18 transfer on the token package, recipient = the vault package', async () => {
    const h = harness();
    await h.ops.fundVault({
      cep18PackageHash: CEP18_PKG,
      vaultPackageHash: VAULT_PKG,
      amount: '50',
    });
    expect(h.builds[0]).toEqual({
      kind: 'versionedCall',
      packageHash: CEP18_PKG,
      entryPoint: 'transfer',
      argNames: ['recipient', 'amount'],
    });
  });

  it('pay calls pay on the vault package with receiver, amount, and a payload_hash nonce', async () => {
    const h = harness();
    await h.ops.pay({ vaultPackageHash: VAULT_PKG, receiver: RECEIVER, amount: '50' });
    expect(h.builds[0]).toEqual({
      kind: 'versionedCall',
      packageHash: VAULT_PKG,
      entryPoint: 'pay',
      argNames: ['receiver', 'amount', 'payload_hash'],
    });
  });

  it('maps an on-chain revert to success:false with the reported errorCode', async () => {
    const h = harness({
      finalize: () => ({ finalizedHeight: 200, success: false, errorCode: 4, hashKind: 'deploy' }),
    });
    const out = await h.ops.pay({ vaultPackageHash: VAULT_PKG, receiver: RECEIVER, amount: '999' });
    expect(out).toEqual({
      deployHash: 'dh:vc-pay-0',
      finalizedHeight: 200,
      success: false,
      errorCode: 4,
    });
  });
});

describe('live-tier1-ops pure address helpers', () => {
  it('derives the agent key from the signer public key, not an env address', () => {
    const expected = PublicKey.fromHex(SIGNER_PK).accountHash().toPrefixedString();
    expect(deriveAgentKey(SIGNER_PK)).toBe(expected);
    expect(deriveAgentKey(SIGNER_PK)).toMatch(/^account-hash-[0-9a-f]{64}$/);
  });

  it('maps a tagged demo address to a Casper Key string by tag', () => {
    expect(keyStringFromTaggedAddress(`00${'ab'.repeat(32)}`)).toBe(
      `account-hash-${'ab'.repeat(32)}`,
    );
    expect(keyStringFromTaggedAddress(`01${'cd'.repeat(32)}`)).toBe(`hash-${'cd'.repeat(32)}`);
    expect(() => keyStringFromTaggedAddress(`99${'ef'.repeat(32)}`)).toThrow(/tagged address/);
  });

  it('renders a bare contract/package hash as a hash- key', () => {
    expect(contractKeyString(VAULT_ENTITY)).toBe(`hash-${VAULT_ENTITY}`);
  });
});

describe('odraInstallArgs (Odra ModuleBytes cfg args)', () => {
  it('prepends the three odra_cfg_* args before the ctor args, with the given key-name', () => {
    const args = odraInstallArgs('PolicyVault', {
      token_package: CLValue.newCLUInt256('1'),
      max_single: CLValue.newCLUInt256('2'),
    });
    expect(Object.keys(args)).toEqual([
      'odra_cfg_is_upgradable',
      'odra_cfg_allow_key_override',
      'odra_cfg_package_hash_key_name',
      'token_package',
      'max_single',
    ]);
    // Locked (not upgradable) + override allowed so a re-run installs a fresh package
    // under the same named key rather than reverting as already-installed.
    expect(args.odra_cfg_is_upgradable?.toString()).toBe('false');
    expect(args.odra_cfg_allow_key_override?.toString()).toBe('true');
    expect(args.odra_cfg_package_hash_key_name?.toString()).toBe('PolicyVault');
  });

  it('does not let ctor args override the cfg args it injects', () => {
    // A ctor arg colliding with a cfg name must not silently flip install behavior.
    const args = odraInstallArgs('Cep18', { odra_cfg_is_upgradable: CLValue.newCLValueBool(true) });
    expect(args.odra_cfg_is_upgradable?.toString()).toBe('false');
  });
});

describe('makeLiveDeployBuilder (default seam over @caspilot/adapters)', () => {
  const builder = makeLiveDeployBuilder({
    chainName: 'casper-test',
    senderPk: SIGNER_PK,
    paymentMotes: { install: '300000000000', call: '5000000000' },
  });

  it('installModule yields a real deploy envelope with a 64-hex deploy hash', () => {
    const env = builder.installModule({ wasm: new Uint8Array([7, 8, 9]), args: {} });
    expect(env.bodyHashHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('versionedCall yields a real deploy envelope targeting the package', () => {
    const env = builder.versionedCall({ packageHash: VAULT_PKG, entryPoint: 'pay', args: {} });
    expect(env.bodyHashHex).toMatch(/^[0-9a-f]{64}$/);
  });
});
