import { readFileSync } from 'node:fs';
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import type { RawSigner, UnsignedDeployEnvelope } from '@caspilot/signer-guard';

export interface LocalDevSignerOptions {
  /** Filesystem path to an ed25519 PEM-encoded private key. */
  pemPath: string;
  /** Injectable reader for tests; defaults to fs.readFileSync(path, 'utf8'). */
  readFile?: (path: string) => string;
}

/**
 * Loads an ed25519 PEM from disk and returns a keyed `local_dev` RawSigner.
 *
 * The private key is confined to this process: it is never passed to the
 * adapter, API, or core. Only the detached, algorithm-tagged signature over the
 * deploy hash crosses the boundary back to the SignerGuard.
 */
export function loadLocalDevSigner(opts: LocalDevSignerOptions): RawSigner {
  const read = opts.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const privateKey = PrivateKey.fromPem(read(opts.pemPath), KeyAlgorithm.ED25519);
  const signerPk = privateKey.publicKey.toHex(false);

  return {
    signerRole: 'local_dev',
    signerPk,
    async sign(unsignedDeploy: UnsignedDeployEnvelope): Promise<{ signatureHex: string }> {
      // A Casper Approval signs the *deploy hash*, which the envelope carries in
      // bodyHashHex. signAndAddAlgorithmBytes prepends the 01 ed25519 tag, the
      // exact 65-byte form Deploy.setSignature/validate() expect.
      const deployHash = Buffer.from(unsignedDeploy.bodyHashHex, 'hex');
      const tagged = privateKey.signAndAddAlgorithmBytes(deployHash);
      return { signatureHex: Buffer.from(tagged).toString('hex') };
    },
  };
}
