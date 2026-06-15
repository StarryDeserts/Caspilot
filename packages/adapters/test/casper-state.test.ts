import { describe, it, expect, vi } from 'vitest';
import { EntityIdentifier, Key, NamedKey } from 'casper-js-sdk';
import type { QueryGlobalStateResult, StateGetEntityResult } from 'casper-js-sdk';
import { CasperStateReader, type EntityStateClient } from '../src/casper-state.js';
import { selectPackageHash } from '../src/package-hash-recovery.js';

// Fully offline: the SDK read surface is injected (EntityStateClient) and we
// hand it the SDK's *typed* result objects. These tests exercise CasperStateReader's
// own logic — named-key mapping, legacy fallback, package version selection, and
// entity-hash rendering — not the JSON-RPC wire deserialization (the SDK owns
// that; it's validated against a live casper-test node when the orchestrator runs).

const DEPLOYER_PK = `01${'a'.repeat(64)}`;
const VAULT_PKG = 'b'.repeat(64);
const VAULT_ENTITY = 'c'.repeat(64);
const OLD_ENTITY = 'd'.repeat(64);

function namedKey(name: string, prefixed: string): NamedKey {
  return new NamedKey(name, Key.newKey(prefixed));
}

function entityResult(entity: unknown): StateGetEntityResult {
  return {
    apiVersion: '2.0.0',
    entity,
    merkleProof: null,
    rawJSON: null,
  } as unknown as StateGetEntityResult;
}

// Odra installs on casper-test produce a *legacy* ContractPackage (stored under
// `hash-<pkg>`, not the 2.0 `package-<pkg>` addressable-entity Package). The SDK
// preserves the untyped node result on rawJSON, where `stored_value.ContractPackage`
// carries `versions: [{ contract_version, contract_hash: 'contract-<hex>' }]`.
function contractPackageResult(
  versions: Array<{ contract_version: number; contract_hash: string }>,
): QueryGlobalStateResult {
  return {
    apiVersion: '2.0.0',
    storedValue: {},
    merkleProof: '',
    rawJSON: { stored_value: { ContractPackage: { versions } } },
  } as unknown as QueryGlobalStateResult;
}

interface Recorded {
  op: 'getLatestEntity' | 'queryLatestGlobalState';
  args: unknown;
}

function fakeClient(
  scripted: { entity?: StateGetEntityResult; pkg?: QueryGlobalStateResult } = {},
): { client: EntityStateClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client: EntityStateClient = {
    getLatestEntity: vi.fn(async (id: EntityIdentifier) => {
      calls.push({ op: 'getLatestEntity', args: id });
      return scripted.entity ?? entityResult({ addressableEntity: { namedKeys: [] } });
    }),
    queryLatestGlobalState: vi.fn(async (key: string, path: string[]) => {
      calls.push({ op: 'queryLatestGlobalState', args: { key, path } });
      return scripted.pkg ?? contractPackageResult([]);
    }),
  };
  return { client, calls };
}

describe('CasperStateReader.readDeployerNamedKeys', () => {
  it('maps addressable-entity named keys to {name, prefixed-key}, consumable by selectPackageHash', async () => {
    const nk = namedKey('PolicyVault', `hash-${VAULT_PKG}`);
    const { client, calls } = fakeClient({
      entity: entityResult({ addressableEntity: { namedKeys: [nk] } }),
    });
    const reader = new CasperStateReader(client);

    const out = await reader.readDeployerNamedKeys(DEPLOYER_PK);

    expect(out).toEqual([{ name: 'PolicyVault', key: nk.key.toPrefixedString() }]);
    // The rendered key must round-trip through the recovery normalizer.
    expect(selectPackageHash(out, 'PolicyVault')).toBe(VAULT_PKG);
    // It read the deployer entity, addressed by its public key.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.op).toBe('getLatestEntity');
    expect(calls[0]!.args).toBeInstanceOf(EntityIdentifier);
  });

  it('falls back to a legacy (1.x) account named keys when no addressable entity is present', async () => {
    const nk = namedKey('Cep18', `hash-${'e'.repeat(64)}`);
    const { client } = fakeClient({
      entity: entityResult({ legacyAccount: { namedKeys: [nk] } }),
    });
    const reader = new CasperStateReader(client);

    const out = await reader.readDeployerNamedKeys(DEPLOYER_PK);

    expect(out).toEqual([{ name: 'Cep18', key: nk.key.toPrefixedString() }]);
  });

  it('returns [] when neither an addressable entity nor a legacy account is present', async () => {
    const { client } = fakeClient({ entity: entityResult({}) });
    const reader = new CasperStateReader(client);

    expect(await reader.readDeployerNamedKeys(DEPLOYER_PK)).toEqual([]);
  });

  // casper-js-sdk 5.0.12 maps EntityOrAccount.legacyAccount from the JSON key
  // 'LegacyAccount', but casper-2.0 testnet returns the legacy account under
  // 'Account' — so the typed legacyAccount is left undefined and the named keys
  // vanish. The SDK preserves the untyped node result on rawJSON; the reader must
  // recover the keys from there, reading the prefixed key string the node already
  // rendered (e.g. 'hash-...').
  it('recovers legacy named keys from rawJSON when the node uses the "Account" shape the SDK leaves unmapped', async () => {
    const key = `hash-${'e'.repeat(64)}`;
    const { client } = fakeClient({
      entity: {
        apiVersion: '2.0.0',
        entity: {},
        merkleProof: null,
        rawJSON: { entity: { Account: { named_keys: [{ name: 'Cep18', key }] } } },
      } as unknown as StateGetEntityResult,
    });
    const reader = new CasperStateReader(client);

    const out = await reader.readDeployerNamedKeys(DEPLOYER_PK);

    expect(out).toEqual([{ name: 'Cep18', key }]);
    // The recovered key must still round-trip through the recovery normalizer.
    expect(selectPackageHash(out, 'Cep18')).toBe('e'.repeat(64));
  });

  it('recovers addressable-entity named keys from the rawJSON "AddressableEntity" shape', async () => {
    const key = `hash-${'f'.repeat(64)}`;
    const { client } = fakeClient({
      entity: {
        apiVersion: '2.0.0',
        entity: {},
        merkleProof: null,
        rawJSON: { entity: { AddressableEntity: { named_keys: [{ name: 'PolicyVault', key }] } } },
      } as unknown as StateGetEntityResult,
    });
    const reader = new CasperStateReader(client);

    expect(await reader.readDeployerNamedKeys(DEPLOYER_PK)).toEqual([{ name: 'PolicyVault', key }]);
  });
});

describe('CasperStateReader.latestPackageEntityHash', () => {
  it('queries hash-<pkg> and returns the highest-version contract hash from the legacy ContractPackage', async () => {
    const { client, calls } = fakeClient({
      pkg: contractPackageResult([
        { contract_version: 1, contract_hash: `contract-${OLD_ENTITY}` },
        { contract_version: 2, contract_hash: `contract-${VAULT_ENTITY}` },
      ]),
    });
    const reader = new CasperStateReader(client);

    const hash = await reader.latestPackageEntityHash(VAULT_PKG);

    // Returns the bare 64-hex contract hash (the `contract-` prefix stripped).
    expect(hash).toBe(VAULT_ENTITY);
    // It addresses the *legacy* ContractPackage key — `hash-`, not `package-`.
    expect(calls).toEqual([
      { op: 'queryLatestGlobalState', args: { key: `hash-${VAULT_PKG}`, path: [] } },
    ]);
  });

  it('selects the max contract version regardless of array order', async () => {
    const { client } = fakeClient({
      pkg: contractPackageResult([
        { contract_version: 5, contract_hash: `contract-${VAULT_ENTITY}` },
        { contract_version: 4, contract_hash: `contract-${OLD_ENTITY}` },
      ]),
    });
    const reader = new CasperStateReader(client);

    expect(await reader.latestPackageEntityHash(VAULT_PKG)).toBe(VAULT_ENTITY);
  });

  it('throws when the stored package has no versions', async () => {
    const { client } = fakeClient({ pkg: contractPackageResult([]) });
    const reader = new CasperStateReader(client);

    await expect(reader.latestPackageEntityHash(VAULT_PKG)).rejects.toThrow(/no stored package/i);
  });
});
