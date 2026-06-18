import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';

// The web app (e.g. :3001 in dev, the Vercel domain in prod) is a different
// origin than this API (:8787). Without an Access-Control-Allow-Origin header
// the browser blocks every fetch — a failure invisible to jsdom + SSR curl,
// which ignore CORS. These guard the documented-but-unimplemented CORS layer
// (docs/deploy-vercel.md). See caspilot-web-browser-smoke.
describe('CORS middleware', () => {
  const ENV_KEY = 'CASPILOT_CORS_ORIGIN';
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[ENV_KEY];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('adds Access-Control-Allow-Origin to a cross-origin GET (default *)', async () => {
    delete process.env[ENV_KEY];
    const app = buildApp({ env: { expectedChainspec: 'casper-test' } });
    const res = await app.request('/healthz', {
      headers: { Origin: 'http://localhost:3001' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers a CORS preflight (OPTIONS) with the allowed methods', async () => {
    delete process.env[ENV_KEY];
    const app = buildApp({ env: { expectedChainspec: 'casper-test' } });
    const res = await app.request('/vaults', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3001',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('echoes a configured allowlist origin from CASPILOT_CORS_ORIGIN', async () => {
    process.env[ENV_KEY] = 'http://localhost:3001,https://caspilot.vercel.app';
    const app = buildApp({ env: { expectedChainspec: 'casper-test' } });
    const res = await app.request('/healthz', {
      headers: { Origin: 'https://caspilot.vercel.app' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://caspilot.vercel.app');
  });

  it('omits the allow-origin header for an origin outside the allowlist', async () => {
    process.env[ENV_KEY] = 'https://caspilot.vercel.app';
    const app = buildApp({ env: { expectedChainspec: 'casper-test' } });
    const res = await app.request('/healthz', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
