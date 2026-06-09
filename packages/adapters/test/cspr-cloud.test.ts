import { describe, it, expect, vi } from 'vitest';
import { CsprCloudAdapter } from '../src/cspr-cloud.js';

describe('CsprCloudAdapter', () => {
  it('healthCheck returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const a = new CsprCloudAdapter({
      baseUrl: 'https://api.cspr.cloud',
      apiKey: 'secret',
      fetch: fetchMock,
    });
    expect(await a.healthCheck()).toMatchObject({ name: 'cspr-cloud', ok: true });
  });

  it('passes Authorization header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const a = new CsprCloudAdapter({
      baseUrl: 'https://api.cspr.cloud',
      apiKey: 'secret',
      fetch: fetchMock,
    });
    await a.healthCheck();
    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/secret/);
  });

  it('reports unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 401 }));
    const a = new CsprCloudAdapter({
      baseUrl: 'https://api.cspr.cloud',
      apiKey: 'secret',
      fetch: fetchMock,
    });
    const r = await a.healthCheck();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/http_401/);
  });
});
