import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';

describe('GET /healthz', () => {
  it('returns 200 ok', async () => {
    const app = buildApp({
      env: { expectedChainspec: 'casper-test' },
    });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
