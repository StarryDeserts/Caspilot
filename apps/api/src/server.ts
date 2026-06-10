import { Hono } from 'hono';
import { intentsRouter, type IntentRouterDeps } from './intents/router.js';

export interface AppEnv {
  expectedChainspec: string;
}

export interface BuildAppOptions {
  env: AppEnv;
  deps?: IntentRouterDeps;
}

export function buildApp(opts: BuildAppOptions) {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/version', (c) => c.json({ chainspec: opts.env.expectedChainspec }));
  if (opts.deps) {
    app.route('/intents', intentsRouter(opts.deps));
  }
  return app;
}
