import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLValue, Deploy, KeyAlgorithm, PrivateKey, PublicKey } from 'casper-js-sdk';
import { buildContractCallDeploy } from '@caspilot/adapters';
import { loadLocalDevSigner } from '../src/local-dev-signer.js';

const FIXED_TS = 1_700_000_000_000;
const TAGGED_ED25519_SIG = /^01[0-9a-f]{128}$/; // 65 bytes: 01 tag + 64-byte sig

function pemFixture(): { pem: string; pk: string } {
  const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
  return { pem: sk.toPem(), pk: sk.publicKey.toHex(false) };
}

function envelopeFor(senderPk: string, amount = 1000) {
  return buildContractCallDeploy({
    chainName: 'casper-test',
    senderPk,
    contractHash: 'a'.repeat(64),
    entryPoint: 'transfer',
    args: { amount: CLValue.newCLUInt512(amount) },
    paymentMotes: '3000000000',
    timestampMs: FIXED_TS,
  });
}

// validate() returns false for a wrong signature, but may also throw on a
// malformed/mismatched approval — treat either as "not valid".
function validates(deploy: Deploy): boolean {
  try {
    return deploy.validate();
  } catch {
    return false;
  }
}

describe('loadLocalDevSigner', () => {
  it('derives signerRole=local_dev and the ed25519 public key from the PEM', () => {
    const { pem, pk } = pemFixture();
    const signer = loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => pem });
    expect(signer.signerRole).toBe('local_dev');
    expect(signer.signerPk).toBe(pk);
    expect(signer.signerPk).toMatch(/^01[0-9a-f]{64}$/);
  });

  it('signs the deploy hash into a tagged signature that Deploy.validate() accepts', async () => {
    const { pem, pk } = pemFixture();
    const signer = loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => pem });
    const env = envelopeFor(pk);

    const { signatureHex } = await signer.sign(env);
    expect(signatureHex).toMatch(TAGGED_ED25519_SIG);

    // Exactly the reattach path submitSignedDeploy (#23) will take.
    const deploy = Deploy.setSignature(
      Deploy.fromJSON(env.headerJson),
      Buffer.from(signatureHex, 'hex'),
      PublicKey.fromHex(signer.signerPk),
    );
    expect(validates(deploy)).toBe(true);
    expect(deploy.approvals).toHaveLength(1);
    expect(deploy.approvals[0]?.signature.toHex()).toBe(signatureHex);
  });

  it('is deterministic (ed25519 RFC 8032): same envelope → identical signature', async () => {
    const { pem, pk } = pemFixture();
    const signer = loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => pem });
    const env = envelopeFor(pk);
    expect((await signer.sign(env)).signatureHex).toBe((await signer.sign(env)).signatureHex);
  });

  it('binds the signature to the specific deploy hash (no cross-deploy reuse)', async () => {
    const { pem, pk } = pemFixture();
    const signer = loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => pem });
    const envA = envelopeFor(pk, 1000);
    const envB = envelopeFor(pk, 2000);
    const sigA = (await signer.sign(envA)).signatureHex;
    const sigB = (await signer.sign(envB)).signatureHex;
    expect(sigA).not.toBe(sigB);

    const wrong = Deploy.setSignature(
      Deploy.fromJSON(envB.headerJson),
      Buffer.from(sigA, 'hex'),
      PublicKey.fromHex(signer.signerPk),
    );
    expect(validates(wrong)).toBe(false);
  });

  it('reads the PEM from disk by default (no readFile override)', () => {
    const { pem, pk } = pemFixture();
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-harness-'));
    const path = join(dir, 'local_dev.pem');
    writeFileSync(path, pem, 'utf8');
    try {
      expect(loadLocalDevSigner({ pemPath: path }).signerPk).toBe(pk);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
