import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { intentsRouter, type IntentRouterDeps } from './intents/router.js';
import { vaultsRouter } from './vaults/router.js';

export interface AppEnv {
  expectedChainspec: string;
}

export interface BuildAppOptions {
  env: AppEnv;
  deps?: IntentRouterDeps;
}

export function buildApp(opts: BuildAppOptions) {
  const app = new Hono();
  // The web app is a different origin than this API (dev :3001 → :8787; prod
  // Vercel domain → hosted API), so the browser blocks every fetch without an
  // Access-Control-Allow-Origin header. Default to '*' — this API is public,
  // read-mostly, holds no secrets, and its only signer is a non-broadcasting
  // local_dev key; prod pins the origin via CASPILOT_CORS_ORIGIN (comma list).
  app.use('*', cors({ origin: process.env.CASPILOT_CORS_ORIGIN?.split(',') ?? '*' }));
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/version', (c) => c.json({ chainspec: opts.env.expectedChainspec }));
  if (opts.deps) {
    app.route('/intents', intentsRouter(opts.deps));
    app.route('/vaults', vaultsRouter(opts.deps));
  }
  return app;
}
