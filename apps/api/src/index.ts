import { serve } from '@hono/node-server';
import { buildApp } from './server.js';
import { buildApiDeps } from './deps.js';

const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';
// Persist the ledger/audit SQLite to a file so intent state survives restarts.
// Point CASPILOT_DB_PATH at a mounted volume in production.
const dbPath = process.env.CASPILOT_DB_PATH ?? './caspilot.db';
const deps = buildApiDeps({ dbPath });
const app = buildApp({ env: { expectedChainspec }, deps });
serve({ fetch: app.fetch, port });
console.log(`caspilot-api listening on :${port}`);
