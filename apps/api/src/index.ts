import { serve } from '@hono/node-server';
import { buildApp } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';
const app = buildApp({ env: { expectedChainspec } });
serve({ fetch: app.fetch, port });
console.log(`caspilot-api listening on :${port}`);
