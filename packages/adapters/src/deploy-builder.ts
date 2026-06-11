import {
  Args,
  ContractHash,
  Deploy,
  DeployHeader,
  Duration,
  ExecutableDeployItem,
  PublicKey,
  StoredContractByHash,
  Timestamp,
  type CLValue,
} from 'casper-js-sdk';
import type { UnsignedDeployEnvelope } from '@caspilot/signer-guard';

// casper-test still accepts the legacy Deploy format; gas price 1 and the
// 30-minute TTL are the network defaults the demo relies on.
const DEFAULT_TTL_MS = 1_800_000;
const DEFAULT_GAS_PRICE = 1;

interface DeployCommon {
  /** Casper network name, e.g. `casper-test`. */
  chainName: string;
  /** Sender public key as hex (`01…`/`02…`); the adapter never holds the key. */
  senderPk: string;
  /** Payment amount in motes (atomic decimal string). */
  paymentMotes: string;
  timestampMs?: number;
  ttlMs?: number;
  gasPrice?: number;
}

export interface BuildContractCallParams extends DeployCommon {
  /** Target contract hash (64 hex chars, no prefix). */
  contractHash: string;
  entryPoint: string;
  args: Record<string, CLValue>;
}

export interface BuildVaultInstallParams extends DeployCommon {
  /** Compiled vault session WASM. */
  moduleWasm: Uint8Array;
  args: Record<string, CLValue>;
}

function makeHeader(p: DeployCommon): DeployHeader {
  return new DeployHeader(
    p.chainName,
    [],
    p.gasPrice ?? DEFAULT_GAS_PRICE,
    new Timestamp(new Date(p.timestampMs ?? Date.now())),
    new Duration(p.ttlMs ?? DEFAULT_TTL_MS),
    PublicKey.fromHex(p.senderPk),
  );
}

// The SignerGuard signs the envelope opaquely, so this adapter owns the
// convention end-to-end (build → sign → submit, enforced by Deploy.validate()):
//   - bodyHashHex = the *deploy hash* — the bytes a Casper Approval signs.
//   - payloadHex  = the Casper *body hash* (hash of payment+session) — provenance.
//   - headerJson  = the authoritative source the submitter reconstructs from.
function toEnvelope(deploy: Deploy): UnsignedDeployEnvelope {
  const bodyHash = deploy.header.bodyHash;
  if (!bodyHash) throw new Error('deploy header is missing its body hash');
  return {
    headerJson: Deploy.toJSON(deploy),
    bodyHashHex: deploy.hash.toHex(),
    payloadHex: bodyHash.toHex(),
  };
}

export function buildContractCallDeploy(p: BuildContractCallParams): UnsignedDeployEnvelope {
  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(
    ContractHash.newContract(p.contractHash),
    p.entryPoint,
    Args.fromMap(p.args),
  );
  const deploy = Deploy.makeDeploy(
    makeHeader(p),
    ExecutableDeployItem.standardPayment(p.paymentMotes),
    session,
  );
  return toEnvelope(deploy);
}

export function buildVaultInstallDeploy(p: BuildVaultInstallParams): UnsignedDeployEnvelope {
  const deploy = Deploy.makeDeploy(
    makeHeader(p),
    ExecutableDeployItem.standardPayment(p.paymentMotes),
    ExecutableDeployItem.newModuleBytes(p.moduleWasm, Args.fromMap(p.args)),
  );
  return toEnvelope(deploy);
}

/**
 * Recompute a deploy hash from an envelope's `headerJson` without any key
 * material. Equality with `bodyHashHex` is the integrity invariant the
 * submitter relies on before broadcasting.
 */
export function deployHashFromEnvelope(envelope: UnsignedDeployEnvelope): string {
  return Deploy.fromJSON(envelope.headerJson).hash.toHex();
}
