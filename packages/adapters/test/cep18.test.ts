import { describe, it, expect, vi } from 'vitest';
import { Cep18ReadAdapter } from '../src/cep18.js';

describe('Cep18ReadAdapter', () => {
  it('balanceOf reads via state_get_dictionary_item and single hash- prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            stored_value: { CLValue: { parsed: '12345', cl_type: 'U256' } },
            merkle_proof: 'omitted',
            api_version: '2.0.0',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const a = new Cep18ReadAdapter({
      rpcUrl: 'http://node/rpc',
      tokenHash: '0'.repeat(64),
      fetch: fetchMock,
    });
    const bal = await a.balanceOf(`00${'11'.repeat(32)}`);
    expect(bal).toBe('12345');

    const callArgs = fetchMock.mock.calls[0];
    if (!callArgs || !callArgs[1]) throw new Error('fetch not called');
    const body = JSON.parse((callArgs[1] as { body: string }).body);
    expect(body.params.dictionary_identifier.ContractNamedKey.key).toBe(`hash-${'0'.repeat(64)}`);
  });

  it('throws http_<status> on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
    const a = new Cep18ReadAdapter({
      rpcUrl: 'http://node/rpc',
      tokenHash: '0'.repeat(64),
      fetch: fetchMock,
    });
    await expect(a.balanceOf(`00${'11'.repeat(32)}`)).rejects.toThrow(/http_500/);
  });
});
