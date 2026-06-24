import Casper from 'casper-js-sdk';
import type { UnsignedDeployEnvelope } from '@caspilot/signer-guard';
import { FetchHandler } from './rpc-fetch-handler.js';

// See rpc-fetch-handler.ts: casper-js-sdk is CJS, so destructure values from the
// default import and recover Deploy's dual-use type via InstanceType.
const { Deploy, PublicKey, RpcClient } = Casper;
type Deploy = InstanceType<typeof Deploy>;

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
  /**
   * Which on-chain variant actually resolved the hash: a legacy `deploy`
   * (Deploy-first probe) or a Casper 2.0 `transaction` (Version1 fallback —
   * native CSPR transfers). The authoritative, chain-resolved source for the
   * cspr.live URL kind, so we never guess /deploy/ vs /transaction/ from a
   * client-supplied hint.
   */
  hashKind: 'deploy' | 'transaction';
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
      // On Condor 2.0 a legacy deploy submitted via account_put_deploy is wrapped
      // as a transaction: info_get_deploy returns execution_info:null forever, so
      // we observe via info_get_transaction. The hash may be a legacy Deploy hash
      // OR a 2.0 TransactionV1 hash (native CSPR transfers are V1) — readExecutionInfo
      // probes the Deploy variant first and falls back to the V1 variant only on a
      // NoSuchTransaction throw. Both-unknown is "not finalized": poll the next attempt.
      const { info, hashKind } = await readExecutionInfo(client, deployHash);
      // Block inclusion alone is not a result: execution_info can carry a block
      // height a beat before the execution_result is attached. Treat "in a block
      // but no result yet" as not-finalized and keep polling for the result.
      if (info?.executionResult) {
        const errorMessage = info.executionResult.errorMessage ?? null;
        const finalization: DeployFinalization = {
          finalizedHeight: info.blockHeight,
          success: !errorMessage,
          hashKind,
        };
        // Attribute a numeric revert code only from Casper's canonical
        // "User error: <code>" form. A stray number in any other message must
        // not be mislabeled — honest provenance: "reverted, code unknown" beats
        // a lucky-match false code.
        const code = Number(errorMessage?.match(/user error:\s*(\d+)/i)?.[1]);
        if (Number.isFinite(code)) finalization.errorCode = code;
        return finalization;
      }
      if (attempt < maxAttempts - 1) await sleep(pollIntervalMs);
    }
    throw new Error('deploy_not_finalized');
  }

  /**
   * Read-only liveness probe backing the `submission` capability slot. Confirms
   * the node we would broadcast to is reachable over the exact transport submit
   * uses — via info_get_status, never account_put_deploy — so a health check can
   * never put a deploy on chain.
   */
  async healthCheck(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await this.rpc('info_get_status', []);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  // submitSignedDeploy and healthCheck broadcast/probe over this hand-rolled
  // JSON-RPC so they move the exact bytes we validated (and return our own
  // recomputed hash, not the node's echo). awaitDeployFinalized instead drives
  // the SDK RpcClient (via FetchHandler) because getDeploy deserializes both the
  // 1.x and 2.0 execution-result shapes — two transports here is deliberate.
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
      // Carry the node's message, not just the code: a bare `rpc_-32008` is
      // undiagnosable, but `rpc_-32008: deploy is invalid: ...` names the cause.
      if (json.error) throw new Error(`rpc_${json.error.code}: ${json.error.message}`);
      return json.result as T;
    } finally {
      clearTimeout(t);
    }
  }
}

/**
 * Reads execution info for a hash that may be EITHER a legacy Deploy hash OR a
 * Casper 2.0 TransactionV1 hash.
 *
 * Probe the Deploy variant first: that keeps the legacy/Tier-1 observe path
 * byte-for-byte unchanged, and a known-but-pending deploy RESOLVES (its
 * executionInfo may be undefined) so we never spuriously query the other variant.
 * Only when the Deploy lookup THROWS (NoSuchTransaction — the hash is not a
 * deploy) do we fall back to the TransactionV1 lookup; native CSPR transfers are
 * V1 and addressable only by transaction hash. Both unknown ⇒ undefined: still
 * propagating, so the caller keeps polling.
 */
async function readExecutionInfo(client: InstanceType<typeof RpcClient>, hash: string) {
  try {
    const res = await client.getTransactionByDeployHash(hash);
    return { info: res?.executionInfo, hashKind: 'deploy' as const };
  } catch {
    const info = await client
      .getTransactionByTransactionHash(hash)
      .then((res) => res?.executionInfo)
      .catch(() => undefined);
    return { info, hashKind: 'transaction' as const };
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
