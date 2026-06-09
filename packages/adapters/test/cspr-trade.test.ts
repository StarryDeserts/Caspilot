import { describe, it, expect, vi } from 'vitest';
import { CsprTradeAdapter } from '../src/cspr-trade.js';

describe('CsprTradeAdapter.buildSwap', () => {
  it('returns a quote with deploy payload and amount_out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amountOut: '12345',
          deployPayload: { kind: 'casper-deploy-stub', hex: 'aa'.repeat(32) },
          route: ['CSPR', 'USDC'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const a = new CsprTradeAdapter({ baseUrl: 'https://trade', fetch: fetchMock });
    const q = await a.buildSwap({
      tokenIn: 'CSPR',
      tokenOut: 'USDC',
      amountIn: '1000',
      slippageBps: 50,
    });
    expect(q.amountOut).toBe('12345');
    expect(q.route).toEqual(['CSPR', 'USDC']);
  });

  it('rejects HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
    const a = new CsprTradeAdapter({ baseUrl: 'https://trade', fetch: fetchMock });
    await expect(
      a.buildSwap({ tokenIn: 'CSPR', tokenOut: 'USDC', amountIn: '1', slippageBps: 50 }),
    ).rejects.toThrow(/http_500/);
  });
});
