import { describe, it, expect, vi } from 'vitest';
import {
  selectPackageHash,
  recoverPackageHash,
  type NamedKeyEntry,
  type NamedKeysReader,
} from '../src/package-hash-recovery.js';

// Fully offline: recovery is string normalization over a named-keys list. The
// live JSON-RPC read that produces that list is injected (NamedKeysReader), so
// the exact Casper-2.0 method is validated when the orchestrator wires it.
const HASH = 'a'.repeat(64);

describe('selectPackageHash', () => {
  it('extracts the 64-hex from a hash-prefixed named key matching the name', () => {
    const keys: NamedKeyEntry[] = [{ name: 'PolicyVault', key: `hash-${HASH}` }];
    expect(selectPackageHash(keys, 'PolicyVault')).toBe(HASH);
  });

  it('strips a package- prefix', () => {
    expect(selectPackageHash([{ name: 'Cep18', key: `package-${HASH}` }], 'Cep18')).toBe(HASH);
  });

  it('strips a contract-package- prefix', () => {
    expect(
      selectPackageHash([{ name: 'Cep18', key: `contract-package-${HASH}` }], 'Cep18'),
    ).toBe(HASH);
  });

  it('accepts a bare 64-hex key with no prefix', () => {
    expect(selectPackageHash([{ name: 'PolicyVault', key: HASH }], 'PolicyVault')).toBe(HASH);
  });

  it('normalizes uppercase hex to lowercase', () => {
    const upper = 'A'.repeat(64);
    expect(selectPackageHash([{ name: 'PolicyVault', key: `hash-${upper}` }], 'PolicyVault')).toBe(
      HASH,
    );
  });

  it('selects the matching entry when several named keys are present', () => {
    const keys: NamedKeyEntry[] = [
      { name: 'Cep18', key: `hash-${'b'.repeat(64)}` },
      { name: 'PolicyVault', key: `hash-${HASH}` },
      { name: 'something_else', key: `uref-${'0'.repeat(64)}-007` },
    ];
    expect(selectPackageHash(keys, 'PolicyVault')).toBe(HASH);
  });

  it('throws a clear error when the contract name is absent', () => {
    expect(() => selectPackageHash([{ name: 'Cep18', key: `hash-${HASH}` }], 'PolicyVault')).toThrow(
      /PolicyVault/,
    );
  });

  it('throws when the matched key is not a 64-hex package hash', () => {
    const keys: NamedKeyEntry[] = [{ name: 'PolicyVault', key: `uref-${'0'.repeat(64)}-007` }];
    expect(() => selectPackageHash(keys, 'PolicyVault')).toThrow(/package hash/);
  });
});

describe('recoverPackageHash', () => {
  it('reads the deployer named keys then returns the selected package hash', async () => {
    const reader: NamedKeysReader = {
      readDeployerNamedKeys: vi.fn(async () => [
        { name: 'PolicyVault', key: `hash-${HASH}` },
      ]),
    };
    const deployerPk = `01${'f'.repeat(64)}`;

    const recovered = await recoverPackageHash(reader, deployerPk, 'PolicyVault');

    expect(recovered).toBe(HASH);
    expect(reader.readDeployerNamedKeys).toHaveBeenCalledWith(deployerPk);
  });

  it('propagates a not-found error from selection', async () => {
    const reader: NamedKeysReader = {
      readDeployerNamedKeys: async () => [{ name: 'Cep18', key: `hash-${HASH}` }],
    };
    await expect(recoverPackageHash(reader, `01${'f'.repeat(64)}`, 'PolicyVault')).rejects.toThrow(
      /PolicyVault/,
    );
  });
});
