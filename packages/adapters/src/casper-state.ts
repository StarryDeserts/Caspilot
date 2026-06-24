import Casper from 'casper-js-sdk';
import type { QueryGlobalStateResult, StateGetEntityResult } from 'casper-js-sdk';
import type { NamedKeyEntry, NamedKeysReader } from './package-hash-recovery.js';
import { FetchHandler } from './rpc-fetch-handler.js';

// See rpc-fetch-handler.ts: casper-js-sdk is CJS, so destructure values from the
// default import and recover EntityIdentifier's dual-use type via InstanceType.
const { EntityIdentifier, PublicKey, RpcClient } = Casper;
type EntityIdentifier = InstanceType<typeof EntityIdentifier>;

/**
 * The narrow slice of the SDK's `RpcClient` the reader drives. Injecting this
 * typed port (rather than a fetch + wire-JSON fixture) keeps the mapping and
 * version-selection logic below offline-testable against the SDK's *own* result
 * objects, while the JSON-RPC wire deserialization stays the SDK's job — proven
 * against a live casper-test node when the orchestrator runs, not mocked here.
 */
export interface EntityStateClient {
  getLatestEntity(entityIdentifier: EntityIdentifier): Promise<StateGetEntityResult>;
  queryLatestGlobalState(key: string, path: string[]): Promise<QueryGlobalStateResult>;
}

/**
 * Recover `{ name, prefixed-key }` entries from the raw `state_get_entity` result
 * the SDK preserves on `rawJSON`. The node wraps the entity under one of three
 * top-level keys depending on protocol/account shape — `AddressableEntity` (2.0
 * entity), `Account` (what casper-2.0 testnet returns for a not-yet-migrated
 * account), or `LegacyAccount` (the key the SDK's own type expects) — each
 * carrying `named_keys: [{ name, key }]` with the key already rendered as a
 * prefixed string. We read whichever the node actually sent.
 */
function rawNamedKeys(raw: unknown): NamedKeyEntry[] {
  const entity = (raw as { entity?: Record<string, unknown> } | null | undefined)?.entity;
  if (!entity || typeof entity !== 'object') return [];
  const container = (entity.AddressableEntity ?? entity.Account ?? entity.LegacyAccount) as
    | { named_keys?: unknown }
    | undefined;
  const namedKeys = container?.named_keys;
  if (!Array.isArray(namedKeys)) return [];
  return namedKeys
    .filter(
      (k): k is { name: string; key: string } =>
        !!k && typeof k.name === 'string' && typeof k.key === 'string',
    )
    .map((k) => ({ name: k.name, key: k.key }));
}

/**
 * Recover the highest-version contract hash from a *legacy* `ContractPackage`,
 * the shape Odra's ModuleBytes installs actually produce on casper-test. The node
 * stores it under `hash-<pkg>` (not the 2.0 addressable-entity `package-<pkg>`),
 * and the SDK preserves the untyped result on `rawJSON.stored_value.ContractPackage`
 * with `versions: [{ contract_version, contract_hash: 'contract-<hex>' }]`. We pick
 * the max `contract_version` (array order is not guaranteed) and return the bare
 * 64-hex hash (`contract-` prefix stripped).
 */
function latestContractHash(raw: unknown): string | undefined {
  const pkg = (
    raw as { stored_value?: { ContractPackage?: { versions?: unknown } } } | null | undefined
  )?.stored_value?.ContractPackage;
  const versions = pkg?.versions;
  if (!Array.isArray(versions)) return undefined;
  const typed = versions.filter(
    (v): v is { contract_version: number; contract_hash: string } =>
      !!v && typeof v.contract_version === 'number' && typeof v.contract_hash === 'string',
  );
  if (typed.length === 0) return undefined;
  const latest = typed.reduce((a, b) => (b.contract_version > a.contract_version ? b : a));
  return latest.contract_hash.replace(/^contract-/, '').toLowerCase();
}

/**
 * Live Casper-2.0 reads behind the {@link NamedKeysReader} seam the package-hash
 * recovery normalizer consumes, plus the package → latest-contract-hash lookup the
 * orchestrator records as the vault's on-chain identity.
 */
export class CasperStateReader implements NamedKeysReader {
  constructor(private readonly client: EntityStateClient) {}

  /**
   * The deployer account's named keys as `{ name, prefixed-key }`. Reads the
   * addressable entity (Casper 2.0); falls back to a legacy 1.x account when no
   * addressable entity is present, so a pre-Condor deployer still resolves.
   */
  async readDeployerNamedKeys(deployerPk: string): Promise<NamedKeyEntry[]> {
    const id = EntityIdentifier.fromPublicKey(PublicKey.fromHex(deployerPk));
    const res = await this.client.getLatestEntity(id);
    const typed = res.entity.addressableEntity?.namedKeys ?? res.entity.legacyAccount?.namedKeys;
    if (typed && typed.length > 0) {
      return typed.map((nk) => ({ name: nk.name, key: nk.key.toPrefixedString() }));
    }
    // casper-js-sdk 5.0.12 maps EntityOrAccount.legacyAccount from the JSON key
    // 'LegacyAccount', but casper-2.0 testnet returns the legacy account under
    // 'Account' — so the typed field is empty and the named keys vanish. The SDK
    // preserves the untyped node result on rawJSON; recover the keys from there.
    return rawNamedKeys(res.rawJSON);
  }

  /**
   * The contract hash of a package's highest version, recorded as the vault's
   * on-chain identity. Odra's installs leave the caller addressing the *package*
   * and produce a legacy `ContractPackage` under `hash-<pkg>`; we read whichever
   * version is newest from {@link latestContractHash}. (The actual entry-point
   * calls target the package hash directly via `StoredVersionedContractByHash`,
   * so this hash is identity-only — never a call target.)
   */
  async latestPackageEntityHash(packageHash: string): Promise<string> {
    const res = await this.client.queryLatestGlobalState(`hash-${packageHash}`, []);
    const hash = latestContractHash(res.rawJSON);
    if (!hash) throw new Error(`no stored package versions for hash-${packageHash}`);
    return hash;
  }
}

/** Build the live RPC-backed client; `fetch` is injectable for parity with the write adapter. */
export function makeRpcEntityClient(opts: {
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): EntityStateClient {
  return new RpcClient(new FetchHandler(opts.url, opts.fetch ?? fetch, opts.timeoutMs ?? 8_000));
}
