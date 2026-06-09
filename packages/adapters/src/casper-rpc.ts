import { z } from 'zod';

const StatusResult = z
  .object({
    api_version: z.string(),
    chainspec_name: z.string(),
    last_added_block_info: z.object({ height: z.number() }).passthrough(),
  })
  .passthrough();

const JsonRpcOk = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.number().or(z.string()),
  result: StatusResult,
});

export interface CasperRpcOptions {
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CasperRpcAdapter {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: CasperRpcOptions) {
    this.url = opts.url;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async getStatus(): Promise<z.infer<typeof StatusResult>> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_status', params: [] }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = JsonRpcOk.parse(await res.json());
      return json.result;
    } finally {
      clearTimeout(t);
    }
  }

  async healthCheck(): Promise<
    | { name: 'casper-rpc'; ok: true; chainspecName: string }
    | { name: 'casper-rpc'; ok: false; reason: string }
  > {
    try {
      const s = await this.getStatus();
      return { name: 'casper-rpc', ok: true, chainspecName: s.chainspec_name };
    } catch (e) {
      return { name: 'casper-rpc', ok: false, reason: String(e instanceof Error ? e.message : e) };
    }
  }
}
