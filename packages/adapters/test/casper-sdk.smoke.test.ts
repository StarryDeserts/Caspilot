import { describe, it, expect } from 'vitest';
import {
  Args,
  ContractHash,
  Deploy,
  DeployHeader,
  Duration,
  ExecutableDeployItem,
  KeyAlgorithm,
  PrivateKey,
  PublicKey,
  StoredContractByHash,
  Timestamp,
  CLValue,
} from 'casper-js-sdk';

// Smoke test: proves casper-js-sdk v5 resolves and runs under the repo's
// NodeNext + Vitest toolchain, and that the exact write-path APIs the Phase-6
// adapter will use (deploy build → sign → validate → JSON round-trip) work.
// Purely offline — no network, no key files.
describe('casper-js-sdk v5 toolchain smoke', () => {
  it('builds, signs, validates, and JSON-round-trips a stored-contract Deploy', () => {
    const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
    const senderPk: PublicKey = sk.publicKey;

    const header = new DeployHeader(
      'casper-test',
      [],
      1,
      new Timestamp(new Date(1_700_000_000_000)),
      new Duration(1_800_000),
      senderPk,
    );

    const session = new ExecutableDeployItem();
    session.storedContractByHash = new StoredContractByHash(
      ContractHash.newContract('a'.repeat(64)),
      'transfer',
      Args.fromMap({ amount: CLValue.newCLUInt512(1000), memo: CLValue.newCLString('caspilot') }),
    );

    const payment = ExecutableDeployItem.standardPayment('3000000000');
    const deploy = Deploy.makeDeploy(header, payment, session);

    const deployHashHex = deploy.hash.toHex();
    expect(deployHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(deploy.header.bodyHash?.toHex()).toMatch(/^[0-9a-f]{64}$/);

    // Sign in-place (the canonical path) — proves crypto + validate() oracle.
    deploy.sign(sk);
    expect(deploy.validate()).toBe(true);
    expect(deploy.approvals).toHaveLength(1);
    expect(senderPk.toHex().startsWith('01')).toBe(true);

    // JSON round-trip must preserve the deploy hash byte-for-byte (the
    // serialization boundary the UnsignedDeployEnvelope relies on).
    const json = Deploy.toJSON(deploy);
    const back = Deploy.fromJSON(json);
    expect(back.hash.toHex()).toBe(deployHashHex);
    expect(back.validate()).toBe(true);
  });
});
