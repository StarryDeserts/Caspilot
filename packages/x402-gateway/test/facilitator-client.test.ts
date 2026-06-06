import { describe, expect, it, vi } from 'vitest';
import { makeHttpFacilitatorClient } from '../src/facilitator-client.js';
import { VerifyRequestSchema } from '../src/schemas/verify.schema.js';

import verifyRequest from '../__fixtures__/verify-request.exact-casper.json' with { type: 'json' };

const req = VerifyRequestSchema.parse(verifyRequest);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch(
  impl: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(impl) as unknown as typeof fetch;
}

describe('makeHttpFacilitatorClient', () => {
  it('POSTs JSON to {baseUrl}/verify and returns parsed body', async () => {
    const fetchMock = fakeFetch(async () => jsonResponse({ isValid: true, payer: '00aa' }));
    const client = makeHttpFacilitatorClient({ baseUrl: 'https://fac.test', fetch: fetchMock });

    const out = await client.verify(req);

    expect(out).toEqual({ isValid: true, payer: '00aa' });
    const call = vi.mocked(fetchMock).mock.calls[0];
    expect(call?.[0]).toBe('https://fac.test/verify');
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[1]?.body).toBe(JSON.stringify(req));
  });

  it('trims a trailing slash from baseUrl', async () => {
    const fetchMock = fakeFetch(async () => jsonResponse({ ok: true }));
    const client = makeHttpFacilitatorClient({ baseUrl: 'https://fac.test/', fetch: fetchMock });

    await client.settle(req);

    expect(vi.mocked(fetchMock).mock.calls[0]?.[0]).toBe('https://fac.test/settle');
  });

  it('attaches a Bearer auth header when apiKey is set', async () => {
    const fetchMock = fakeFetch(async () => jsonResponse({ kinds: [] }));
    const client = makeHttpFacilitatorClient({
      baseUrl: 'https://fac.test',
      apiKey: 'secret-key',
      fetch: fetchMock,
    });

    await client.supported();

    const headers = vi.mocked(fetchMock).mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-key');
  });

  it('GETs /supported', async () => {
    const fetchMock = fakeFetch(async () => jsonResponse({ kinds: [] }));
    const client = makeHttpFacilitatorClient({ baseUrl: 'https://fac.test', fetch: fetchMock });

    await client.supported();

    expect(vi.mocked(fetchMock).mock.calls[0]?.[0]).toBe('https://fac.test/supported');
    expect(vi.mocked(fetchMock).mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('throws "facilitator {path} returned {status}" on a non-ok response', async () => {
    const fetchMock = fakeFetch(async () => jsonResponse({ error: 'boom' }, 500));
    const client = makeHttpFacilitatorClient({ baseUrl: 'https://fac.test', fetch: fetchMock });

    await expect(client.verify(req)).rejects.toThrow('facilitator /verify returned 500');
  });
});
