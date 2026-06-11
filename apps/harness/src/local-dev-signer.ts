import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import type { RawSigner, UnsignedDeployEnvelope } from '@caspilot/signer-guard';

/** Raised when a signer key is referenced in an unsafe or malformed way. */
export class LocalDevSignerError extends Error {}

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
  const p = opts.pemPath;
  if (!p || typeof p !== 'string') throw new LocalDevSignerError('pemPath is required');
  // Refuse a raw key passed where a path belongs — keeps private-key bytes out
  // of argv/process listings/logs and forbids the inline-secret anti-pattern.
  if (p.includes('-----')) {
    throw new LocalDevSignerError('pemPath must be a filesystem path, not an inline PEM body');
  }
  if (!isAbsolute(p)) throw new LocalDevSignerError(`pemPath must be an absolute path: ${p}`);
  // Path-shape guards above always run. The existence check lives in the default
  // disk reader so an injected reader (the test seam) remains the data source.
  const read =
    opts.readFile ??
    ((path: string) => {
      if (!existsSync(path)) throw new LocalDevSignerError(`pemPath does not exist: ${path}`);
      return readFileSync(path, 'utf8');
    });
  const privateKey = PrivateKey.fromPem(read(p), KeyAlgorithm.ED25519);
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
