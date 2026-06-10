import { z } from 'zod';

const Resp = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  result: z
    .object({
      stored_value: z
        .object({ CLValue: z.object({ parsed: z.union([z.string(), z.number()]) }).passthrough() })
        .passthrough(),
    })
    .passthrough(),
});

export interface Cep18ReadOptions {
  rpcUrl: string;
  /** Raw 64-hex CEP-18 contract hash WITHOUT the `hash-` prefix; the adapter adds it. */
  tokenHash: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class Cep18ReadAdapter {
  private readonly rpcUrl: string;
  private readonly tokenHash: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: Cep18ReadOptions) {
    this.rpcUrl = opts.rpcUrl;
    this.tokenHash = opts.tokenHash;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async balanceOf(accountHash: string): Promise<string> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'state_get_dictionary_item',
          params: {
            state_root_hash: 'latest',
            dictionary_identifier: {
              ContractNamedKey: {
                key: `hash-${this.tokenHash}`,
                dictionary_name: 'balances',
                dictionary_item_key: accountHash,
              },
            },
          },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = Resp.parse(await res.json());
      return String(json.result.stored_value.CLValue.parsed);
    } finally {
      clearTimeout(t);
    }
  }
}
