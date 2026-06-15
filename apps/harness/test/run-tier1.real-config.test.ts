import { describe, it, expect } from 'vitest';
import { KeyAlgorithm, PrivateKey, TypeID } from 'casper-js-sdk';
import type { RawSigner } from '@caspilot/signer-guard';
import { buildTier1RealConfig, assembleTier1LiveDeps } from '../scripts/run-tier1.js';
import type { Tier1Broadcaster, Tier1Reader } from '../src/live-tier1-ops.js';

const FIXED_NOW = 1_700_000_000_000;
const SEVEN_DAYS_MS = 7 * 86_400_000;

/** The full real-mode env: the dry baseEnv plus the install-fresh CEP-18 facts. */
function realEnv(): Record<string, string> {
  return {
    CASPER_NODE_RPC: 'http://node:7777/rpc',
    CASPER_CHAINSPEC: 'casper-test',
    LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k.pem',
    CEP18_CONTRACT_HASH: 'a'.repeat(64),
    DEMO_AGENT_HASH: `00${'bb'.repeat(32)}`,
    DEMO_RECEIVER_HASH: `00${'cc'.repeat(32)}`,
    DEMO_BLOCKED_RECEIVER_HASH: `00${'dd'.repeat(32)}`,
    DEMO_MAX_SINGLE: '100',
    DEMO_DAILY_LIMIT: '500',
    DEMO_PAY_AMOUNT: '50',
    DEMO_REJECTION_AMOUNT: '999',
    VAULT_WASM_PATH: '/tmp/vault.wasm',
    CEP18_WASM_PATH: '/tmp/cep18.wasm',
    RUN_REAL_ONCHAIN: '1',
  };
}

describe('buildTier1RealConfig', () => {
  it('reads required env and applies metadata + payment + validity-window defaults', () => {
    const config = buildTier1RealConfig({ env: realEnv(), now: () => FIXED_NOW });
    expect(config.rpc).toBe('http://node:7777/rpc');
    expect(config.chainName).toBe('casper-test');
    expect(config.signerKeyPath).toBe('/tmp/k.pem');
    // The funded casper-test signer is secp256k1; that is the default.
    expect(config.signerAlgorithm).toBe(KeyAlgorithm.SECP256K1);
    expect(config.cep18WasmPath).toBe('/tmp/cep18.wasm');
    expect(config.vaultWasmPath).toBe('/tmp/vault.wasm');
    expect(config.cep18).toEqual({
      name: 'CaspilotDemoUSD',
      symbol: 'CDUSD',
      decimals: 9,
      totalSupply: '1000000000',
    });
    expect(config.vault.maxSingle).toBe('100');
    expect(config.vault.dailyLimit).toBe('500');
    expect(config.vault.validUntilMs).toBe(FIXED_NOW + SEVEN_DAYS_MS);
    expect(config.paymentMotes.install).toBe('500000000000');
    expect(config.paymentMotes.call).toBe('5000000000');
  });

  it('applies CEP-18 metadata, payment, and validUntil overrides from env', () => {
    const env = {
      ...realEnv(),
      CEP18_NAME: 'TestTok',
      CEP18_SYMBOL: 'TTK',
      CEP18_DECIMALS: '6',
      CEP18_TOTAL_SUPPLY: '42',
      CASPER_INSTALL_PAYMENT_MOTES: '111',
      CASPER_CALL_PAYMENT_MOTES: '222',
      DEMO_VAULT_VALID_UNTIL_MS: '1900000000000',
    };
    const config = buildTier1RealConfig({ env, now: () => FIXED_NOW });
    expect(config.cep18).toEqual({
      name: 'TestTok',
      symbol: 'TTK',
      decimals: 6,
      totalSupply: '42',
    });
    expect(config.paymentMotes).toEqual({ install: '111', call: '222' });
    expect(config.vault.validUntilMs).toBe(1_900_000_000_000);
  });

  it('selects ed25519 when CASPER_SIGNER_ALGORITHM=ed25519', () => {
    const config = buildTier1RealConfig({
      env: { ...realEnv(), CASPER_SIGNER_ALGORITHM: 'ed25519' },
      now: () => FIXED_NOW,
    });
    expect(config.signerAlgorithm).toBe(KeyAlgorithm.ED25519);
  });

  it('throws on an unsupported signer algorithm', () => {
    expect(() =>
      buildTier1RealConfig({
        env: { ...realEnv(), CASPER_SIGNER_ALGORITHM: 'rsa' },
        now: () => FIXED_NOW,
      }),
    ).toThrow(/CASPER_SIGNER_ALGORITHM/);
  });

  it('throws when CEP18_WASM_PATH is missing (orchestrator installs CEP-18 fresh)', () => {
    const env = { ...realEnv() };
    delete (env as Record<string, string | undefined>).CEP18_WASM_PATH;
    expect(() => buildTier1RealConfig({ env, now: () => FIXED_NOW })).toThrow(/CEP18_WASM_PATH/);
  });

  it('throws when VAULT_WASM_PATH is missing', () => {
    const env = { ...realEnv() };
    delete (env as Record<string, string | undefined>).VAULT_WASM_PATH;
    expect(() => buildTier1RealConfig({ env, now: () => FIXED_NOW })).toThrow(/VAULT_WASM_PATH/);
  });

  it('rejects a CEP18_DECIMALS outside the u8 range', () => {
    expect(() =>
      buildTier1RealConfig({ env: { ...realEnv(), CEP18_DECIMALS: '999' }, now: () => FIXED_NOW }),
    ).toThrow(/CEP18_DECIMALS/);
  });
});

describe('assembleTier1LiveDeps', () => {
  // A real secp256k1 pk so makeLiveDeployBuilder's stored senderPk is well-formed,
  // even though this test never invokes the builder (no network).
  const signerPk = PrivateKey.generate(KeyAlgorithm.SECP256K1).publicKey.toHex(false);
  const signer: RawSigner = {
    signerRole: 'local_dev',
    signerPk,
    async sign() {
      return { signatureHex: 'ab'.repeat(33) };
    },
  };
  const broadcaster: Tier1Broadcaster = {
    async submitSignedDeploy() {
      return { deployHash: 'a'.repeat(64) };
    },
    async awaitDeployFinalized() {
      return { finalizedHeight: 1, success: true };
    },
  };
  const reader: Tier1Reader = {
    async readDeployerNamedKeys() {
      return [];
    },
    async latestPackageEntityHash() {
      return 'f'.repeat(64);
    },
  };

  it('wires CEP-18 install args, reads both WASM files, and threads vault bounds + handles', () => {
    const config = buildTier1RealConfig({ env: realEnv(), now: () => FIXED_NOW });
    const reads: string[] = [];
    const deps = assembleTier1LiveDeps({
      config,
      signer,
      broadcaster,
      reader,
      readWasm: (p) => {
        reads.push(p);
        return new Uint8Array([1, 2, 3]);
      },
    });

    // The full 7-arg Odra `Cep18::init` ABI (odra-modules 2.0.0), in declaration
    // order. Odra cfg args (package-hash key-name/override/upgradable) are added
    // later by buildLiveTier1Ops; these are the bare constructor args.
    expect(Object.keys(deps.cep18.installArgs)).toEqual([
      'symbol',
      'name',
      'decimals',
      'initial_supply',
      'admin_list',
      'minter_list',
      'modality',
    ]);
    expect(deps.cep18.installArgs.symbol?.toString()).toBe('CDUSD');
    expect(deps.cep18.installArgs.name?.toString()).toBe('CaspilotDemoUSD');
    expect(deps.cep18.installArgs.decimals?.toString()).toBe('9');
    expect(deps.cep18.installArgs.initial_supply?.toString()).toBe('1000000000');

    // admin_list and minter_list are empty List<Key> — the installer (caller)
    // is granted Admin unconditionally by init, so no extra grants are needed.
    const adminList = deps.cep18.installArgs.admin_list;
    expect(adminList?.getType().getTypeID()).toBe(TypeID.List);
    expect(adminList?.list?.isEmpty()).toBe(true);
    expect(adminList?.list?.type.elementsType.getTypeID()).toBe(TypeID.Key);

    const minterList = deps.cep18.installArgs.minter_list;
    expect(minterList?.getType().getTypeID()).toBe(TypeID.List);
    expect(minterList?.list?.isEmpty()).toBe(true);
    expect(minterList?.list?.type.elementsType.getTypeID()).toBe(TypeID.Key);

    // modality is Option::None — serializes to a single `00` tag, so the wire
    // form never depends on the Cep18Modality enum byte-width.
    const modality = deps.cep18.installArgs.modality;
    expect(modality?.getType().getTypeID()).toBe(TypeID.Option);
    expect(modality?.option?.isEmpty()).toBe(true);

    // CEP-18 wasm is read before the vault wasm.
    expect(reads).toEqual(['/tmp/cep18.wasm', '/tmp/vault.wasm']);
    expect(deps.cep18.wasm).toEqual(new Uint8Array([1, 2, 3]));
    expect(deps.vault.wasm).toEqual(new Uint8Array([1, 2, 3]));

    expect(deps.vault.maxSingle).toBe('100');
    expect(deps.vault.dailyLimit).toBe('500');
    expect(deps.vault.validUntilMs).toBe(FIXED_NOW + SEVEN_DAYS_MS);

    // The injected live handles pass through untouched.
    expect(deps.signer).toBe(signer);
    expect(deps.broadcaster).toBe(broadcaster);
    expect(deps.reader).toBe(reader);
  });
});
