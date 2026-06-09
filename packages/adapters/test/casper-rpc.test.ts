import { describe, it, expect, vi } from 'vitest';
import { CasperRpcAdapter } from '../src/casper-rpc.js';

describe('CasperRpcAdapter', () => {
  it('getStatus parses chainspec_name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            api_version: '2.0.0',
            chainspec_name: 'casper-test',
            last_added_block_info: { height: 123 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    const s = await a.getStatus();
    expect(s.chainspec_name).toBe('casper-test');
  });

  it('healthCheck returns { ok:true, chainspecName } on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            chainspec_name: 'casper-test',
            api_version: '2.0.0',
            last_added_block_info: { height: 1 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    expect(await a.healthCheck()).toEqual({
      name: 'casper-rpc',
      ok: true,
      chainspecName: 'casper-test',
    });
  });

  it('healthCheck returns { ok:false, reason } on http error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    const r = await a.healthCheck();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/http_500/);
  });
});
