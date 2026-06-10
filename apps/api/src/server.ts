import { Hono } from 'hono';

export interface AppEnv {
  expectedChainspec: string;
}

export interface BuildAppOptions {
  env: AppEnv;
}

export function buildApp(opts: BuildAppOptions) {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/version', (c) => c.json({ chainspec: opts.env.expectedChainspec }));
  return app;
}
