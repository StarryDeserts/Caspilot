import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLValue, Deploy, KeyAlgorithm, PrivateKey, PublicKey } from 'casper-js-sdk';
import { buildContractCallDeploy } from '@caspilot/adapters';
import { loadLocalDevSigner, LocalDevSignerError } from '../src/local-dev-signer.js';

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

describe('loadLocalDevSigner file-only guards', () => {
  it('refuses an inline PEM body passed where a path belongs', () => {
    const { pem } = pemFixture();
    expect(() => loadLocalDevSigner({ pemPath: pem })).toThrow(LocalDevSignerError);
  });

  it('refuses a relative path', () => {
    expect(() =>
      loadLocalDevSigner({ pemPath: 'keys/local_dev.pem', readFile: () => 'x' }),
    ).toThrow(LocalDevSignerError);
  });

  it('refuses a missing file with a clear error (default disk reader)', () => {
    expect(() => loadLocalDevSigner({ pemPath: '/nonexistent/caspilot/local_dev.pem' })).toThrow(
      /does not exist/,
    );
  });

  it('does not enforce existence when a readFile override supplies the bytes', () => {
    const { pem, pk } = pemFixture();
    // Absolute, non-inline path that does not exist on disk: the injected
    // reader is the data source, so the existence check must be bypassed.
    expect(loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => pem }).signerPk).toBe(pk);
  });
});

describe('loadLocalDevSigner (secp256k1)', () => {
  // 65 bytes on the wire: 02 secp256k1 tag + 64-byte ECDSA signature.
  const TAGGED_SECP_SIG = /^02[0-9a-f]{128}$/;

  function secpFixture(): { pem: string; pk: string } {
    const sk = PrivateKey.generate(KeyAlgorithm.SECP256K1);
    return { pem: sk.toPem(), pk: sk.publicKey.toHex(false) };
  }

  it('derives the 02-tagged secp256k1 public key when algorithm=SECP256K1', () => {
    const { pem, pk } = secpFixture();
    const signer = loadLocalDevSigner({
      pemPath: '/unused.pem',
      readFile: () => pem,
      algorithm: KeyAlgorithm.SECP256K1,
    });
    expect(signer.signerRole).toBe('local_dev');
    expect(signer.signerPk).toBe(pk);
    expect(signer.signerPk).toMatch(/^02[0-9a-f]+$/);
  });

  it('signs the deploy hash into a tagged secp256k1 signature Deploy.validate() accepts', async () => {
    const { pem, pk } = secpFixture();
    const signer = loadLocalDevSigner({
      pemPath: '/unused.pem',
      readFile: () => pem,
      algorithm: KeyAlgorithm.SECP256K1,
    });
    const env = envelopeFor(pk);

    const { signatureHex } = await signer.sign(env);
    expect(signatureHex).toMatch(TAGGED_SECP_SIG);

    // Same reattach path submitSignedDeploy takes — proves the tag/length are
    // exactly what Deploy.setSignature/validate() expect for secp256k1.
    const deploy = Deploy.setSignature(
      Deploy.fromJSON(env.headerJson),
      Buffer.from(signatureHex, 'hex'),
      PublicKey.fromHex(signer.signerPk),
    );
    expect(validates(deploy)).toBe(true);
    expect(deploy.approvals).toHaveLength(1);
  });

  it('still defaults to ed25519 when no algorithm is given', () => {
    const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
    const signer = loadLocalDevSigner({ pemPath: '/unused.pem', readFile: () => sk.toPem() });
    expect(signer.signerPk).toBe(sk.publicKey.toHex(false));
    expect(signer.signerPk).toMatch(/^01[0-9a-f]{64}$/);
  });
});
