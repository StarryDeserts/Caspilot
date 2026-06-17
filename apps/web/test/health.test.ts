import { describe, it, expect, vi } from 'vitest';
import { CaspilotApi } from '../src/lib/api.js';
import { mapHealth } from '../src/lib/health.js';

describe('mapHealth', () => {
  it('maps an unreachable probe to down', () => {
    expect(mapHealth({ reachable: false }).status).toBe('down');
  });

  it('maps a 2xx probe to healthy', () => {
    expect(mapHealth({ reachable: true, httpStatus: 200 }).status).toBe('healthy');
  });

  it('maps a reachable non-2xx probe to degraded and names the status code', () => {
    const r = mapHealth({ reachable: true, httpStatus: 503 });
    expect(r.status).toBe('degraded');
    expect(r.label).toContain('503');
  });
});

describe('CaspilotApi.health', () => {
  it('GETs /healthz and reports reachable + httpStatus on 200', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.health();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/healthz');
    expect(r).toEqual({ reachable: true, httpStatus: 200 });
  });

  it('does NOT throw on a non-2xx response — it reports it as reachable+degraded', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream down', { status: 503 }));
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.health();
    expect(r).toEqual({ reachable: true, httpStatus: 503 });
  });

  it('reports unreachable when the network rejects, never throwing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    const api = new CaspilotApi({
      baseUrl: 'http://api.test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await api.health();
    expect(r.reachable).toBe(false);
  });
});
