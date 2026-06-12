import { createHash } from 'node:crypto';
import { CLValue, Key, PublicKey } from 'casper-js-sdk';
import {
  buildVaultInstallDeploy,
  buildVersionedContractCallDeploy,
  recoverPackageHash as recoverInstalledPackageHash,
  type DeployFinalization,
  type NamedKeyEntry,
} from '@caspilot/adapters';
import type { RawSigner, UnsignedDeployEnvelope } from '@caspilot/signer-guard';
import type { StepOutcome, Tier1ChainOps } from './orchestrate-tier1.js';

/**
 * Broadcasts a signed deploy and awaits its finalized execution. Structurally
 * satisfied by `CasperDeployAdapter` (submit/await); the orchestrator only ever
 * sees this narrow port, so the offline test drives it with a recording fake.
 */
export interface Tier1Broadcaster {
  submitSignedDeploy(input: {
    envelope: UnsignedDeployEnvelope;
    signatureHex: string;
    signerPk: string;
  }): Promise<{ deployHash: string }>;
  awaitDeployFinalized(deployHash: string): Promise<DeployFinalization>;
}

/**
 * Reads the deployer's named keys (to recover Odra package hashes) and a
 * package's latest entity hash. Structurally satisfied by `CasperStateReader`.
 */
export interface Tier1Reader {
  readDeployerNamedKeys(deployerPk: string): Promise<NamedKeyEntry[]>;
  latestPackageEntityHash(packageHash: string): Promise<string>;
}

/**
 * The deploy-builder seam. Injecting it keeps `buildLiveTier1Ops`'s wiring —
 * which builder/entry point each op drives, and the args it carries —
 * offline-assertable, while the live default ({@link makeLiveDeployBuilder})
 * produces real, byte-exact envelopes the signer can approve.
 */
export interface Tier1DeployBuilder {
  installModule(input: { wasm: Uint8Array; args: Record<string, CLValue> }): UnsignedDeployEnvelope;
  versionedCall(input: {
    packageHash: string;
    entryPoint: string;
    args: Record<string, CLValue>;
  }): UnsignedDeployEnvelope;
}

export interface Tier1LiveDeps {
  signer: RawSigner;
  broadcaster: Tier1Broadcaster;
  reader: Tier1Reader;
  build: Tier1DeployBuilder;
  /** CEP-18 session WASM + its install args (token metadata + initial supply). */
  cep18: { wasm: Uint8Array; installArgs: Record<string, CLValue> };
  /** PolicyVault session WASM + the policy bounds its `init` enforces. */
  vault: { wasm: Uint8Array; maxSingle: string; dailyLimit: string; validUntilMs: number };
}

/**
 * The agent the vault must allow is the deploy signer's *own* account — never an
 * env-supplied address. Allowing a different agent would let the demo's accepted
 * pay revert as `AgentNotAllowed` instead of reaching the receiver/amount guards.
 */
export function deriveAgentKey(signerPk: string): string {
  return PublicKey.fromHex(signerPk).accountHash().toPrefixedString();
}

/**
 * Map a tagged Odra demo address to its Casper `Key` string: `00…` is an account
 * (→ `account-hash-…`), `01…` a contract package (→ `hash-…`). Any other tag is
 * a config error and fails loudly rather than addressing the wrong key space.
 */
export function keyStringFromTaggedAddress(tagged: string): string {
  const tag = tagged.slice(0, 2);
  const body = tagged.slice(2);
  if (tag === '00') return `account-hash-${body}`;
  if (tag === '01') return `hash-${body}`;
  throw new Error(`unsupported tagged address tag "${tag}": ${tagged}`);
}

/** Render a bare 64-hex contract/package hash as a Casper `hash-` Key string. */
export function contractKeyString(hex: string): string {
  return `hash-${hex}`;
}

/**
 * Wrap an Odra contract's `init` args with the three config args every Odra
 * ModuleBytes install consumes (proven against odra-core 2.0 `install_contract`):
 * `odra_cfg_is_upgradable` (false → a locked contract), `odra_cfg_allow_key_override`
 * (true → a re-run installs a fresh package under the same named key instead of
 * reverting as already-installed), and `odra_cfg_package_hash_key_name`, which is
 * the *literal* deployer named key the package hash lands under — so it must equal
 * the name {@link recoverPackageHash} later looks up. Without these three the install
 * reverts before `init`, so they are non-optional, not a default.
 *
 * The cfg names are a reserved namespace: a colliding ctor arg is dropped rather
 * than allowed to flip install behavior.
 */
export function odraInstallArgs(
  packageKeyName: string,
  initArgs: Record<string, CLValue>,
): Record<string, CLValue> {
  const merged: Record<string, CLValue> = {
    odra_cfg_is_upgradable: CLValue.newCLValueBool(false),
    odra_cfg_allow_key_override: CLValue.newCLValueBool(true),
    odra_cfg_package_hash_key_name: CLValue.newCLString(packageKeyName),
  };
  for (const [name, value] of Object.entries(initArgs)) {
    if (name in merged) continue;
    merged[name] = value;
  }
  return merged;
}

/** A deterministic 32-byte nonce binding a payment to its receiver + amount. */
function payloadHash(receiver: string, amount: string): Uint8Array {
  return createHash('sha256').update(receiver).update(':').update(amount).digest();
}

/**
 * The live deploy-builder seam over `@caspilot/adapters`. Installs go through the
 * ModuleBytes builder (install payment); every Odra entry point goes through the
 * versioned-package builder (call payment), since an Odra install publishes a
 * package whose calls resolve to the latest enabled version.
 */
export function makeLiveDeployBuilder(opts: {
  chainName: string;
  senderPk: string;
  paymentMotes: { install: string; call: string };
}): Tier1DeployBuilder {
  return {
    installModule({ wasm, args }) {
      return buildVaultInstallDeploy({
        chainName: opts.chainName,
        senderPk: opts.senderPk,
        paymentMotes: opts.paymentMotes.install,
        moduleWasm: wasm,
        args,
      });
    },
    versionedCall({ packageHash, entryPoint, args }) {
      return buildVersionedContractCallDeploy({
        chainName: opts.chainName,
        senderPk: opts.senderPk,
        paymentMotes: opts.paymentMotes.call,
        packageHash,
        entryPoint,
        args,
      });
    },
  };
}

/**
 * Assemble the live {@link Tier1ChainOps} the orchestrator drives. Each op builds
 * its deploy through the injected builder, then signs → submits → awaits via the
 * one shared {@link dispatch}, so the private key only ever produces a detached
 * signature that crosses into the broadcaster — the adapter never holds it.
 */
export function buildLiveTier1Ops(deps: Tier1LiveDeps): Tier1ChainOps {
  const deployerPk = deps.signer.signerPk;

  async function dispatch(envelope: UnsignedDeployEnvelope): Promise<StepOutcome> {
    const { signatureHex } = await deps.signer.sign(envelope);
    const { deployHash } = await deps.broadcaster.submitSignedDeploy({
      envelope,
      signatureHex,
      signerPk: deployerPk,
    });
    const fin = await deps.broadcaster.awaitDeployFinalized(deployHash);
    const outcome: StepOutcome = {
      deployHash,
      finalizedHeight: fin.finalizedHeight,
      success: fin.success,
    };
    // exactOptionalPropertyTypes: only attach errorCode when the chain reported one.
    if (fin.errorCode !== undefined) outcome.errorCode = fin.errorCode;
    return outcome;
  }

  return {
    installCep18() {
      return dispatch(
        deps.build.installModule({
          wasm: deps.cep18.wasm,
          args: odraInstallArgs('Cep18', deps.cep18.installArgs),
        }),
      );
    },

    recoverPackageHash(name) {
      return recoverInstalledPackageHash(deps.reader, deployerPk, name);
    },

    installVault({ cep18PackageHash }) {
      return dispatch(
        deps.build.installModule({
          wasm: deps.vault.wasm,
          args: odraInstallArgs('PolicyVault', {
            token_package: CLValue.newCLKey(Key.newKey(contractKeyString(cep18PackageHash))),
            max_single: CLValue.newCLUInt256(deps.vault.maxSingle),
            daily_limit: CLValue.newCLUInt256(deps.vault.dailyLimit),
            valid_until_ms: CLValue.newCLUint64(deps.vault.validUntilMs),
          }),
        }),
      );
    },

    recoverVaultContractHash(vaultPackageHash) {
      return deps.reader.latestPackageEntityHash(vaultPackageHash);
    },

    allowAgent({ vaultPackageHash }) {
      return dispatch(
        deps.build.versionedCall({
          packageHash: vaultPackageHash,
          entryPoint: 'allow_agent',
          args: { agent: CLValue.newCLKey(Key.newKey(deriveAgentKey(deployerPk))) },
        }),
      );
    },

    allowReceiver({ vaultPackageHash, receiver }) {
      return dispatch(
        deps.build.versionedCall({
          packageHash: vaultPackageHash,
          entryPoint: 'allow_receiver',
          args: { receiver: CLValue.newCLKey(Key.newKey(keyStringFromTaggedAddress(receiver))) },
        }),
      );
    },

    fundVault({ cep18PackageHash, vaultContractHash, amount }) {
      return dispatch(
        deps.build.versionedCall({
          packageHash: cep18PackageHash,
          entryPoint: 'transfer',
          args: {
            recipient: CLValue.newCLKey(Key.newKey(contractKeyString(vaultContractHash))),
            amount: CLValue.newCLUInt256(amount),
          },
        }),
      );
    },

    pay({ vaultPackageHash, receiver, amount }) {
      return dispatch(
        deps.build.versionedCall({
          packageHash: vaultPackageHash,
          entryPoint: 'pay',
          args: {
            receiver: CLValue.newCLKey(Key.newKey(keyStringFromTaggedAddress(receiver))),
            amount: CLValue.newCLUInt256(amount),
            payload_hash: CLValue.newCLByteArray(payloadHash(receiver, amount)),
          },
        }),
      );
    },
  };
}
