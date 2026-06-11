/**
 * Recover an Odra-installed contract *package* hash from the deployer's named
 * keys. After a ModuleBytes install, Odra stores the package hash under a named
 * key equal to the contract name (e.g. `PolicyVault`, `Cep18`). The orchestrator
 * then calls that package via {@link buildVersionedContractCallDeploy}.
 *
 * The wire read is injected ({@link NamedKeysReader}) so the offline-testable
 * normalization below is decoupled from the live Casper-2.0 JSON-RPC call (the
 * exact entity/named-key method is validated when the orchestrator wires it).
 */

/** A single named key as `{ name, rendered-key }`, e.g. `hash-<64hex>`. */
export interface NamedKeyEntry {
  name: string;
  key: string;
}

/** Reads the deployer account's named keys; the live RPC seam. */
export interface NamedKeysReader {
  readDeployerNamedKeys(deployerPk: string): Promise<NamedKeyEntry[]>;
}

const HEX64 = /^[0-9a-f]{64}$/;
// Casper renders a stored package key with one of these prefixes (or none).
const KEY_PREFIXES = ['contract-package-', 'package-', 'hash-'];

/**
 * Pick the named key matching `contractName` and normalize it to a bare,
 * lowercase 64-hex package hash. Throws if the name is absent or the matched
 * key is not a package hash (e.g. a uref/dictionary key) — chain data is a
 * trust boundary, so a wrong shape must fail loudly, not return garbage.
 */
export function selectPackageHash(namedKeys: NamedKeyEntry[], contractName: string): string {
  const entry = namedKeys.find((k) => k.name === contractName);
  if (!entry) {
    throw new Error(`no named key for contract "${contractName}" on the deployer account`);
  }
  const prefix = KEY_PREFIXES.find((p) => entry.key.startsWith(p));
  const hex = (prefix ? entry.key.slice(prefix.length) : entry.key).toLowerCase();
  if (!HEX64.test(hex)) {
    throw new Error(`named key "${contractName}" is not a 64-hex package hash: ${entry.key}`);
  }
  return hex;
}

/** Read the deployer's named keys, then resolve `contractName` to its package hash. */
export async function recoverPackageHash(
  reader: NamedKeysReader,
  deployerPk: string,
  contractName: string,
): Promise<string> {
  return selectPackageHash(await reader.readDeployerNamedKeys(deployerPk), contractName);
}
