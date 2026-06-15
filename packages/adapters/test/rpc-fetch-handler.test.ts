import { describe, it, expect, vi } from 'vitest';
import { Method, RpcRequest } from 'casper-js-sdk';
import { FetchHandler } from '../src/rpc-fetch-handler.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// The SDK's RpcRequest annotates its `version` property with @jsonMember({ name:
// 'jsonrpc' }), so the only correct serializer is one that renames the key. A
// plain JSON.stringify(req) emits {"version":"2.0",...}, which every Casper node
// rejects with -32600 Invalid Request. This is the transport every SDK RpcClient
// call flows through, so the envelope must be exactly JSON-RPC 2.0 on the wire.
describe('FetchHandler request envelope', () => {
  it('puts the JSON-RPC version under a jsonrpc field (not version) so the node accepts it', async () => {
    let sentBody = '';
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      sentBody = (init as RequestInit).body as string;
      return jsonResponse({ jsonrpc: '2.0', id: '1', result: { api_version: '2.0.0' } });
    });
    const handler = new FetchHandler(
      'http://node:7777/rpc',
      fetchMock as unknown as typeof fetch,
      8_000,
    );

    await handler.processCall(RpcRequest.defaultRpcRequest(Method.GetStatus, {}));

    const sent = JSON.parse(sentBody);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent).not.toHaveProperty('version');
    expect(sent.method).toBe('info_get_status');
    expect(sent.id).toBe('1');
  });

  it('preserves method and params bytes for a parameterized call', async () => {
    let sentBody = '';
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      sentBody = (init as RequestInit).body as string;
      return jsonResponse({ jsonrpc: '2.0', id: '1', result: {} });
    });
    const handler = new FetchHandler(
      'http://node:7777/rpc',
      fetchMock as unknown as typeof fetch,
      8_000,
    );

    const params = { entity_identifier: { PublicKey: '0202' + 'a'.repeat(64) } };
    await handler.processCall(RpcRequest.defaultRpcRequest(Method.GetStateEntity, params));

    const sent = JSON.parse(sentBody);
    expect(sent.jsonrpc).toBe('2.0');
    expect(sent.method).toBe('state_get_entity');
    expect(sent.params).toEqual(params);
  });

  it('maps a node result onto the RpcResponse the SDK client expects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ jsonrpc: '2.0', id: '1', result: { api_version: '2.0.0' } }),
      );
    const handler = new FetchHandler(
      'http://node:7777/rpc',
      fetchMock as unknown as typeof fetch,
      8_000,
    );

    const out = await handler.processCall(RpcRequest.defaultRpcRequest(Method.GetStatus, {}));

    expect(out.result).toEqual({ api_version: '2.0.0' });
    expect(out.error).toBeUndefined();
  });

  it('surfaces a JSON-RPC error so the SDK client can throw on it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: '1',
        error: { code: -32600, message: 'Invalid Request' },
      }),
    );
    const handler = new FetchHandler(
      'http://node:7777/rpc',
      fetchMock as unknown as typeof fetch,
      8_000,
    );

    const out = await handler.processCall(RpcRequest.defaultRpcRequest(Method.GetStatus, {}));

    // A present error makes the SDK client throw; it needs both the numeric code
    // and the node's human-readable reason to be diagnosable.
    expect(out.error).toBeDefined();
    expect(out.error?.code).toBe(-32600);
    expect(out.error?.message).toBe('Invalid Request');
  });

  it('raises http_<status> when the node returns a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const handler = new FetchHandler(
      'http://node:7777/rpc',
      fetchMock as unknown as typeof fetch,
      8_000,
    );

    await expect(
      handler.processCall(RpcRequest.defaultRpcRequest(Method.GetStatus, {})),
    ).rejects.toThrow('http_503');
  });
});
