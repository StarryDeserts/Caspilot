import { describe, it, expect, vi } from 'vitest';
import { EntityAddr, EntityIdentifier, Hash, Key, NamedKey } from 'casper-js-sdk';
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

function packageResult(versions: unknown[]): QueryGlobalStateResult {
  return {
    apiVersion: '2.0.0',
    storedValue: {
      package: { versions, disabledVersions: [], lockStatus: 'Unlocked', groups: [] },
    },
    merkleProof: '',
    rawJSON: null,
  } as unknown as QueryGlobalStateResult;
}

function version(entityHex: string, entityVersion: number) {
  return {
    addressableEntity: new EntityAddr(undefined, undefined, Hash.fromHex(entityHex)),
    entityVersionKey: { entityVersion, protocolVersionMajor: 2 },
  };
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
      return scripted.pkg ?? packageResult([]);
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
});

describe('CasperStateReader.latestPackageEntityHash', () => {
  it('queries the package key and returns the highest-version entity hash', async () => {
    const { client, calls } = fakeClient({
      pkg: packageResult([version(OLD_ENTITY, 1), version(VAULT_ENTITY, 2)]),
    });
    const reader = new CasperStateReader(client);

    const hash = await reader.latestPackageEntityHash(VAULT_PKG);

    expect(hash).toBe(VAULT_ENTITY);
    expect(calls).toEqual([
      { op: 'queryLatestGlobalState', args: { key: `package-${VAULT_PKG}`, path: [] } },
    ]);
  });

  it('selects the max entity version regardless of array order', async () => {
    const { client } = fakeClient({
      pkg: packageResult([version(VAULT_ENTITY, 5), version(OLD_ENTITY, 4)]),
    });
    const reader = new CasperStateReader(client);

    expect(await reader.latestPackageEntityHash(VAULT_PKG)).toBe(VAULT_ENTITY);
  });

  it('throws when the stored package has no versions', async () => {
    const { client } = fakeClient({ pkg: packageResult([]) });
    const reader = new CasperStateReader(client);

    await expect(reader.latestPackageEntityHash(VAULT_PKG)).rejects.toThrow(/no stored package/i);
  });
});
