import { describe, it, expect } from 'vitest';
import { Args, CLValue, Deploy, KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import {
  buildContractCallDeploy,
  buildNativeTransferDeploy,
  buildVaultInstallDeploy,
  buildVersionedContractCallDeploy,
  deployAccountFromEnvelope,
  deployHashFromEnvelope,
} from '../src/deploy-builder.js';

// Fully offline: deploy construction is pure CPU (build → hash → serialize).
// No network, no key files, no signing — that is the signer's job (#22).
const FIXED_TS = 1_700_000_000_000;
const CHAIN = 'casper-test';
const HEX64 = /^[0-9a-f]{64}$/;

function senderHex(): string {
  // Non-checksummed (lowercase) hex, matching the CasperPublicKeyHex contract.
  return PrivateKey.generate(KeyAlgorithm.ED25519).publicKey.toHex(false);
}

function contractCall(sender: string, overrides: Record<string, CLValue> = {}) {
  return buildContractCallDeploy({
    chainName: CHAIN,
    senderPk: sender,
    contractHash: 'a'.repeat(64),
    entryPoint: 'transfer',
    args: {
      amount: CLValue.newCLUInt512(1000),
      memo: CLValue.newCLString('caspilot'),
      ...overrides,
    },
    paymentMotes: '3000000000',
    timestampMs: FIXED_TS,
  });
}

function versionedCall(sender: string, overrides: Record<string, CLValue> = {}) {
  return buildVersionedContractCallDeploy({
    chainName: CHAIN,
    senderPk: sender,
    // Odra installs expose a *package* hash; the call resolves to its latest version.
    packageHash: 'c'.repeat(64),
    entryPoint: 'pay',
    args: {
      amount: CLValue.newCLUInt512(1000),
      memo: CLValue.newCLString('caspilot'),
      ...overrides,
    },
    paymentMotes: '3000000000',
    timestampMs: FIXED_TS,
  });
}

function vaultInstall(sender: string) {
  return buildVaultInstallDeploy({
    chainName: CHAIN,
    senderPk: sender,
    moduleWasm: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    args: {
      initial_admin: CLValue.newCLString('caspilot'),
      max_spend: CLValue.newCLUInt512(1_000_000),
    },
    paymentMotes: '50000000000',
    timestampMs: FIXED_TS,
  });
}

describe('buildContractCallDeploy', () => {
  it('produces a well-formed UnsignedDeployEnvelope whose bodyHashHex is the deploy hash', () => {
    const env = contractCall(senderHex());

    expect(env.bodyHashHex).toMatch(HEX64);
    expect(env.payloadHex).toMatch(HEX64);
    expect(typeof env.headerJson).toBe('object');

    // The shipped contract puts the *deploy hash* in bodyHashHex (what the
    // signer signs), NOT the Casper body hash — they must differ.
    expect(env.bodyHashHex).not.toBe(env.payloadHex);
  });

  it('round-trips: Deploy.fromJSON(headerJson).hash === bodyHashHex', () => {
    const env = contractCall(senderHex());
    const back = Deploy.fromJSON(env.headerJson);
    expect(back.hash.toHex()).toBe(env.bodyHashHex);
    expect(back.header.bodyHash?.toHex()).toBe(env.payloadHex);
    // Session is a stored-contract call (not module bytes).
    expect(back.session.storedContractByHash).toBeDefined();
    expect(back.session.moduleBytes).toBeUndefined();
  });

  it('is deterministic for identical inputs (same sender + fixed timestamp)', () => {
    const sender = senderHex();
    expect(contractCall(sender).bodyHashHex).toBe(contractCall(sender).bodyHashHex);
  });

  it('changes the deploy hash when an argument changes', () => {
    const sender = senderHex();
    const a = contractCall(sender, { amount: CLValue.newCLUInt512(1000) });
    const b = contractCall(sender, { amount: CLValue.newCLUInt512(2000) });
    expect(a.bodyHashHex).not.toBe(b.bodyHashHex);
  });
});

describe('buildVaultInstallDeploy', () => {
  it('produces a well-formed envelope backed by ModuleBytes session', () => {
    const env = vaultInstall(senderHex());

    expect(env.bodyHashHex).toMatch(HEX64);
    expect(env.payloadHex).toMatch(HEX64);

    const back = Deploy.fromJSON(env.headerJson);
    expect(back.hash.toHex()).toBe(env.bodyHashHex);
    expect(back.session.moduleBytes).toBeDefined();
    expect(back.session.storedContractByHash).toBeUndefined();
  });

  it('differs from a contract-call deploy built by the same sender', () => {
    const sender = senderHex();
    expect(vaultInstall(sender).bodyHashHex).not.toBe(contractCall(sender).bodyHashHex);
  });
});

describe('buildVersionedContractCallDeploy', () => {
  it('produces a well-formed envelope whose bodyHashHex is the deploy hash', () => {
    const env = versionedCall(senderHex());

    expect(env.bodyHashHex).toMatch(HEX64);
    expect(env.payloadHex).toMatch(HEX64);
    expect(typeof env.headerJson).toBe('object');
    expect(env.bodyHashHex).not.toBe(env.payloadHex);
  });

  it('round-trips with a stored *versioned* contract session (latest version)', () => {
    const env = versionedCall(senderHex());
    const back = Deploy.fromJSON(env.headerJson);

    expect(back.hash.toHex()).toBe(env.bodyHashHex);
    expect(back.header.bodyHash?.toHex()).toBe(env.payloadHex);
    // Package-hash call → versioned session, NOT a by-hash contract call.
    expect(back.session.storedVersionedContractByHash).toBeDefined();
    expect(back.session.storedContractByHash).toBeUndefined();
    expect(back.session.moduleBytes).toBeUndefined();
  });

  it('is deterministic for identical inputs', () => {
    const sender = senderHex();
    expect(versionedCall(sender).bodyHashHex).toBe(versionedCall(sender).bodyHashHex);
  });

  it('changes the deploy hash when an argument changes', () => {
    const sender = senderHex();
    const a = versionedCall(sender, { amount: CLValue.newCLUInt512(1000) });
    const b = versionedCall(sender, { amount: CLValue.newCLUInt512(2000) });
    expect(a.bodyHashHex).not.toBe(b.bodyHashHex);
  });

  it('differs from a by-hash contract-call deploy built by the same sender', () => {
    const sender = senderHex();
    // Same entry point/args but a versioned session must serialize differently.
    expect(versionedCall(sender).bodyHashHex).not.toBe(contractCall(sender).bodyHashHex);
  });
});

describe('deployHashFromEnvelope', () => {
  it('keylessly recomputes the deploy hash from headerJson and agrees with bodyHashHex', () => {
    const env = contractCall(senderHex());
    // Authoritative derivation from headerJson, not an echo of bodyHashHex.
    expect(deployHashFromEnvelope(env)).toBe(env.bodyHashHex);
  });

  it('detects tampering: a mutated bodyHashHex no longer matches the recomputed hash', () => {
    const env = contractCall(senderHex());
    const tampered = { ...env, bodyHashHex: 'b'.repeat(64) };
    expect(deployHashFromEnvelope(tampered)).not.toBe(tampered.bodyHashHex);
  });
});

describe('deployAccountFromEnvelope', () => {
  it('keylessly recovers the deploy account (the key that will sign and pay)', () => {
    const sender = senderHex();
    const env = contractCall(sender);
    expect(deployAccountFromEnvelope(env)).toBe(sender);
  });

  it('recovers the initiator pubkey from a Casper 2.0 native TransactionV1 envelope', () => {
    // A native CSPR transfer's headerJson is a bare TransactionV1, not a legacy
    // Deploy — Deploy.fromJSON throws on it. Recovery must parse the unified
    // Transaction and read the initiator (the user pubkey that signs AND pays).
    const sender = senderHex();
    const env = buildNativeTransferDeploy({
      chainName: CHAIN,
      senderPk: sender,
      paymentMotes: '100000000',
      recipient: senderHex(),
      amountMotes: '2500000000',
      timestampMs: FIXED_TS,
    });
    expect(deployAccountFromEnvelope(env)).toBe(sender);
  });
});
