import { Deploy, PublicKey } from 'casper-js-sdk';
import type { UnsignedDeployEnvelope } from '@caspilot/signer-guard';

export interface CasperDeployOptions {
  url: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface SubmitSignedDeployInput {
  envelope: UnsignedDeployEnvelope;
  /** Algorithm-tagged detached signature over the deploy hash (e.g. 01 + 64 bytes). */
  signatureHex: string;
  signerPk: string;
}

interface JsonRpcEnvelope<T> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Broadcasts an externally-signed Casper Deploy.
 *
 * The private key never reaches this adapter — only the detached, tagged
 * signature does. We rebuild the byte-identical deploy from the envelope,
 * reattach the signature, and re-validate it offline; a wrong or mismatched
 * approval throws before any network call, so it can never leave the process.
 */
export class CasperDeployAdapter {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: CasperDeployOptions) {
    this.url = opts.url;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async submitSignedDeploy(input: SubmitSignedDeployInput): Promise<{ deployHash: string }> {
    const deploy = reconstructValidated(input);
    await this.rpc('account_put_deploy', { deploy: Deploy.toJSON(deploy) });
    // Return the locally-recomputed hash, not the node's echo — we already
    // validated this deploy, so it is the trustworthy identifier.
    return { deployHash: deploy.hash.toHex() };
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = (await res.json()) as JsonRpcEnvelope<T>;
      if (json.error) throw new Error(`rpc_${json.error.code}`);
      return json.result as T;
    } finally {
      clearTimeout(t);
    }
  }
}

function reconstructValidated(input: SubmitSignedDeployInput): Deploy {
  const { envelope, signatureHex, signerPk } = input;

  let base: Deploy;
  try {
    base = Deploy.fromJSON(envelope.headerJson);
  } catch {
    throw new Error('deploy_validation_failed');
  }

  // Envelope integrity: the claimed deploy hash must match the rebuilt deploy
  // before we even consider the signature.
  if (base.hash.toHex() !== envelope.bodyHashHex) {
    throw new Error('deploy_hash_mismatch');
  }

  try {
    const signed = Deploy.setSignature(
      base,
      Buffer.from(signatureHex, 'hex'),
      PublicKey.fromHex(signerPk),
    );
    if (!signed.validate()) throw new Error('invalid');
    return signed;
  } catch {
    throw new Error('deploy_validation_failed');
  }
}
