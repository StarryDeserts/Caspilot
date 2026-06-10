import { z } from 'zod';

const Resp = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  result: z
    .object({
      stored_value: z
        .object({
          CLValue: z.object({ parsed: z.union([z.string(), z.number()]) }).passthrough(),
        })
        .passthrough(),
    })
    .passthrough(),
});

export interface Cep18ReadOptions {
  rpcUrl: string;
  tokenHash: string;
  fetch?: typeof fetch;
}

export class Cep18ReadAdapter {
  constructor(private readonly opts: Cep18ReadOptions) {}

  async balanceOf(accountHash: string): Promise<string> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(this.opts.rpcUrl, {
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
              key: `hash-${this.opts.tokenHash}`,
              dictionary_name: 'balances',
              dictionary_item_key: accountHash,
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const json = Resp.parse(await res.json());
    return String(json.result.stored_value.CLValue.parsed);
  }
}
