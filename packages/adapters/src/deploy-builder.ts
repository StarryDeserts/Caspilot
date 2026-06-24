import Casper from 'casper-js-sdk';
import type { UnsignedDeployEnvelope } from '@caspilot/signer-guard';

// See rpc-fetch-handler.ts: casper-js-sdk is CJS, so destructure values from the
// default import and recover the dual-use class types via InstanceType.
const {
  Args,
  CLValue,
  ContractHash,
  Deploy,
  DeployHeader,
  Duration,
  ExecutableDeployItem,
  Key,
  NativeTransferBuilder,
  PublicKey,
  StoredContractByHash,
  StoredVersionedContractByHash,
  Timestamp,
  Transaction,
} = Casper;
type CLValue = InstanceType<typeof CLValue>;
type Deploy = InstanceType<typeof Deploy>;
type DeployHeader = InstanceType<typeof DeployHeader>;

// casper-test still accepts the legacy Deploy format; gas price 1 and the
// 30-minute TTL are the network defaults the demo relies on.
const DEFAULT_TTL_MS = 1_800_000;
const DEFAULT_GAS_PRICE = 1;
// A native transfer must carry a memo id; the value is provenance, not money.
// A fixed default keeps the deploy hash deterministic for identical inputs.
const DEFAULT_TRANSFER_ID = 1;

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

export interface BuildVersionedContractCallParams extends DeployCommon {
  /** Target contract *package* hash (64 hex chars, no prefix). */
  packageHash: string;
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

// Odra installs publish a contract *package*; calls resolve to the latest
// enabled version. The recovered hash is therefore a package hash, so the demo
// dispatches every PolicyVault/CEP-18 entry point through this versioned form
// (omitting the version argument selects the latest).
export function buildVersionedContractCallDeploy(
  p: BuildVersionedContractCallParams,
): UnsignedDeployEnvelope {
  const session = new ExecutableDeployItem();
  session.storedVersionedContractByHash = new StoredVersionedContractByHash(
    ContractHash.newContract(p.packageHash),
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

export interface BuildCep18TransferParams extends DeployCommon {
  /** CEP-18 token contract *package* hash (bare 64-hex or a 2-char-tagged 66-hex demo address). */
  tokenPackage: string;
  /** Recipient account: a tagged `00…`/`01…` demo address, or an `account-hash-…`/`hash-…` key string. */
  recipient: string;
  /** Transfer amount in the token's atomic units (decimal string). */
  amount: string;
}

// Accept either a bare 64-hex package hash or the demo's 2-char-tagged 66-hex
// address; ContractHash.newContract needs the bare form. Fail loudly on anything
// else so a malformed package can never silently address the wrong contract.
function bareHash(hash: string): string {
  if (/^[0-9a-fA-F]{64}$/.test(hash)) return hash.toLowerCase();
  if (/^[0-9a-fA-F]{66}$/.test(hash)) return hash.slice(2).toLowerCase();
  throw new Error(`unsupported package hash "${hash}"`);
}

// Resolve a recipient to a Casper Key string. Already-prefixed keys pass through;
// a 2-char-tagged demo address maps 00→account-hash, 01→hash (contract).
function recipientKeyString(recipient: string): string {
  if (recipient.startsWith('account-hash-') || recipient.startsWith('hash-')) return recipient;
  const tag = recipient.slice(0, 2);
  const body = recipient.slice(2);
  if (tag === '00') return `account-hash-${body}`;
  if (tag === '01') return `hash-${body}`;
  throw new Error(`unsupported recipient address "${recipient}"`);
}

// A CEP-18 `transfer` is a versioned-package call carrying (recipient: Key,
// amount: U256) — the same encoding the live harness's fundVault/pay use. The
// sender pubkey becomes the deploy account, so the user signs and pays.
export function buildCep18TransferDeploy(p: BuildCep18TransferParams): UnsignedDeployEnvelope {
  return buildVersionedContractCallDeploy({
    chainName: p.chainName,
    senderPk: p.senderPk,
    paymentMotes: p.paymentMotes,
    ...(p.timestampMs !== undefined ? { timestampMs: p.timestampMs } : {}),
    ...(p.ttlMs !== undefined ? { ttlMs: p.ttlMs } : {}),
    ...(p.gasPrice !== undefined ? { gasPrice: p.gasPrice } : {}),
    packageHash: bareHash(p.tokenPackage),
    entryPoint: 'transfer',
    args: {
      recipient: CLValue.newCLKey(Key.newKey(recipientKeyString(p.recipient))),
      amount: CLValue.newCLUInt256(p.amount),
    },
  });
}

export interface BuildNativeTransferParams extends DeployCommon {
  /**
   * Recipient public key hex (`01…` ED25519 / `02…` SECP256K1). A native transfer
   * targets a PublicKey (not an account-hash); the node credits the account
   * derived from it, creating that account if it does not yet exist.
   */
  recipient: string;
  /** Amount in motes (decimal string). casper-test enforces a 2.5 CSPR (2_500_000_000 motes) minimum. */
  amountMotes: string;
  /** Transfer memo id (the SDK requires one). Defaults to a fixed value for hash determinism. */
  transferId?: number;
}

// A native CSPR transfer moves native CSPR (no token contract), so it can
// broadcast from any funded testnet wallet, unlike a CEP-18 transfer that needs
// a token balance. On Casper 2.0 (Condor) this MUST be a TransactionV1 — target
// Native, entry point Transfer, PaymentLimited pricing — NOT a legacy Deploy
// `transfer` session: that session path reverts on-chain with "Invalid purse"
// under the 2.0 AddressableEntity account model. The sender pubkey becomes the
// transaction initiator, so the user signs AND pays from their own wallet.
//
// A TransactionV1 has a single hash (no separate deploy-hash vs body-hash), so
// the envelope carries it in both `bodyHashHex` (the bytes a wallet Approval
// signs) and `payloadHex`. `headerJson` is the full TransactionV1 JSON the
// CSPR.click `send()` path forwards to the wallet, and that the on-chain
// verifier can re-derive the transaction hash from.
export function buildNativeTransferDeploy(p: BuildNativeTransferParams): UnsignedDeployEnvelope {
  // A native transfer moves CSPR between two DISTINCT purses. If the recipient
  // public key equals the sender's, source purse == target purse and the mint
  // reverts on-chain (EqualSourceAndTarget, code 17 → "Invalid purse"): the tx is
  // mined and charged gas but moves nothing. Refuse to build a transfer that can
  // never succeed, so the wallet never pops and no gas is wasted. The receiver is
  // user-supplied (possibly checksummed), so compare normalized hex.
  if (p.senderPk.toLowerCase() === p.recipient.toLowerCase()) {
    throw new Error('refusing self-transfer: recipient equals sender (would revert on-chain "Invalid purse")');
  }
  const builder = new NativeTransferBuilder()
    .from(PublicKey.fromHex(p.senderPk))
    .target(PublicKey.fromHex(p.recipient))
    .amount(p.amountMotes)
    .id(p.transferId ?? DEFAULT_TRANSFER_ID)
    .chainName(p.chainName)
    // gasPriceTolerance: the live casper-test chainspec runs at gas price 1.
    .payment(Number(p.paymentMotes), p.gasPrice ?? DEFAULT_GAS_PRICE)
    .timestamp(new Timestamp(new Date(p.timestampMs ?? Date.now())))
    .ttl(p.ttlMs ?? DEFAULT_TTL_MS);
  const tx = builder.build();
  const v1 = tx.getTransactionV1();
  // build() returns a 2.0 TransactionV1; guard so a future SDK change that
  // silently produced a Deploy can never masquerade as the native path.
  if (!v1) throw new Error('native transfer did not build a TransactionV1');
  const hashHex = v1.hash.toHex();
  return {
    headerJson: tx.toJSON(),
    bodyHashHex: hashHex,
    payloadHex: hashHex,
  };
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

/**
 * Keylessly recover the deploy's account (the public key that will sign and pay)
 * from an envelope. Lets a caller confirm whose key a deploy charges — e.g. that
 * a user-co-signed transfer is paid from the user's own wallet, not the agent's.
 */
export function deployAccountFromEnvelope(envelope: UnsignedDeployEnvelope): string {
  const account = recoverEnvelopeAccountHex(envelope);
  // No recoverable account ⇒ malformed/tampered envelope: refuse rather than
  // guess whose key it charges. Mirrors deployHashFromEnvelope's integrity stance.
  if (!account) throw new Error('envelope missing deploy account');
  return account;
}

// Legacy Deploy carries the paying account in its header; a Casper 2.0
// TransactionV1 (native CSPR transfer) carries it as the initiator pubkey. Both
// are non-checksummed (toHex(false)) per the CasperPublicKeyHex contract.
// Deploy.fromJSON cannot parse a bare V1 body, so a parse failure IS the V1
// branch — fall back to the unified Transaction parser there.
function recoverEnvelopeAccountHex(envelope: UnsignedDeployEnvelope): string | undefined {
  let deploy: Deploy;
  try {
    deploy = Deploy.fromJSON(envelope.headerJson);
  } catch {
    return Transaction.fromJSON(envelope.headerJson).initiatorAddr.publicKey?.toHex(false);
  }
  return deploy.header.account?.toHex(false);
}
