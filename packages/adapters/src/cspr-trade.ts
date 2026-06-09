import { z } from 'zod';

const Quote = z.object({
  amountOut: z.string().regex(/^\d+$/),
  deployPayload: z.unknown(),
  route: z.array(z.string()).min(2),
});
export type SwapQuote = z.infer<typeof Quote>;

export interface CsprTradeOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CsprTradeAdapter {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: CsprTradeOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async buildSwap(req: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
  }): Promise<SwapQuote> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}/build_swap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      return Quote.parse(await res.json());
    } finally {
      clearTimeout(t);
    }
  }
}
