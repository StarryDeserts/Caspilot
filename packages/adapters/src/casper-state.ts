import { EntityIdentifier, PublicKey, RpcClient } from 'casper-js-sdk';
import type { QueryGlobalStateResult, StateGetEntityResult } from 'casper-js-sdk';
import type { NamedKeyEntry, NamedKeysReader } from './package-hash-recovery.js';
import { FetchHandler } from './rpc-fetch-handler.js';

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
 * Live Casper-2.0 reads behind the {@link NamedKeysReader} seam the package-hash
 * recovery normalizer consumes, plus the package → latest-entity-hash lookup the
 * orchestrator needs to address a versioned contract call.
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
    const namedKeys =
      res.entity.addressableEntity?.namedKeys ?? res.entity.legacyAccount?.namedKeys ?? [];
    return namedKeys.map((nk) => ({ name: nk.name, key: nk.key.toPrefixedString() }));
  }

  /**
   * The entity hash of a package's highest version. Odra installs leave the
   * caller addressing the *package*; a versioned contract call needs the entity
   * hash of its newest version, so we pick the max `entityVersion` (array order
   * is not guaranteed) and render its addressable-entity hash.
   */
  async latestPackageEntityHash(packageHash: string): Promise<string> {
    const res = await this.client.queryLatestGlobalState(`package-${packageHash}`, []);
    const pkg = res.storedValue.package;
    if (!pkg || pkg.versions.length === 0) {
      throw new Error(`no stored package versions for package-${packageHash}`);
    }
    const latest = pkg.versions.reduce((a, b) =>
      b.entityVersionKey.entityVersion > a.entityVersionKey.entityVersion ? b : a,
    );
    const addr = latest.addressableEntity;
    const hash = addr.smartContract ?? addr.account ?? addr.system;
    if (!hash) throw new Error('package latest version has no entity hash');
    return hash.toHex();
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
