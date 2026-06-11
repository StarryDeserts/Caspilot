import {
  Deploy,
  PublicKey,
  RpcClient,
  RpcError,
  RpcResponse,
  type IHandler,
  type RpcRequest,
} from 'casper-js-sdk';
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

export interface AwaitDeployOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
  /** Injectable for tests; defaults to a real timer-backed delay. */
  sleep?: (ms: number) => Promise<void>;
}

export interface DeployFinalization {
  /** Height of the block that executed the deploy. */
  finalizedHeight: number;
  /** False when the execution reverted. */
  success: boolean;
  /** The contract's numeric revert code, when one was reported. */
  errorCode?: number;
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

  /**
   * Polls `info_get_deploy` until the deploy executes in a block, then reports
   * the finalized height and whether it reverted.
   *
   * A revert is honest provenance, not an error: a Tier-1 PolicyVault rejection
   * surfaces here as `success: false` with the contract's numeric `errorCode`,
   * so the agent can attribute the outcome rather than guess. A throw from the
   * node (the propagation window where it does not yet know the deploy) and an
   * accepted-but-unexecuted deploy are both treated as "retry", not failure.
   */
  async awaitDeployFinalized(
    deployHash: string,
    opts: AwaitDeployOptions = {},
  ): Promise<DeployFinalization> {
    const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    const maxAttempts = opts.maxAttempts ?? 30;
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const client = new RpcClient(new FetchHandler(this.url, this.fetchImpl, this.timeoutMs));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // A throw means the node does not know the deploy yet (or a transient RPC
      // error) — both are "not finalized", so fall through to the next attempt.
      const res = await client.getDeploy(deployHash).catch(() => undefined);
      const info = res?.executionInfo;
      if (info) {
        const errorMessage = info.executionResult?.errorMessage ?? null;
        const finalization: DeployFinalization = {
          finalizedHeight: info.blockHeight,
          success: !errorMessage,
        };
        const code = errorMessage ? Number(errorMessage.match(/\d+/)?.[0]) : Number.NaN;
        if (Number.isFinite(code)) finalization.errorCode = code;
        return finalization;
      }
      if (attempt < maxAttempts - 1) await sleep(pollIntervalMs);
    }
    throw new Error('deploy_not_finalized');
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

/**
 * Drives the SDK's `RpcClient` over our injected fetch. The client builds the
 * typed request and deserializes both Casper 1.x (`execution_results`) and
 * 2.0 (`execution_info`) result shapes; we only move bytes and surface errors.
 */
class FetchHandler implements IHandler {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number,
  ) {}

  async processCall(req: RpcRequest): Promise<RpcResponse> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = (await res.json()) as {
        jsonrpc?: string;
        result?: unknown;
        error?: { code: number; message: string };
      };
      const out = new RpcResponse();
      out.version = json.jsonrpc ?? '2.0';
      if (req.id !== undefined) out.id = req.id;
      out.result = json.result;
      // A present `error` makes RpcClient.getDeploy throw — exactly the signal
      // awaitDeployFinalized treats as the propagation window.
      if (json.error) out.error = new RpcError(json.error.code, json.error.message);
      return out;
    } finally {
      clearTimeout(t);
    }
  }
}
