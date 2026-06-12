import { RpcError, RpcResponse, type IHandler, type RpcRequest } from 'casper-js-sdk';

/**
 * Drives the SDK's `RpcClient` over an injected `fetch`. The client builds the
 * typed request and deserializes the response shapes; this only moves bytes and
 * surfaces errors. Shared by the write adapter (getDeploy) and the read adapter
 * (getLatestEntity / queryLatestGlobalState) so both speak the exact transport a
 * single injected fetch defines — the seam every offline test drives.
 */
export class FetchHandler implements IHandler {
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
      // A present `error` makes the SDK client throw — callers treat that as a
      // transient/propagation signal rather than a hard failure.
      if (json.error) out.error = new RpcError(json.error.code, json.error.message);
      return out;
    } finally {
      clearTimeout(t);
    }
  }
}
