import { serve } from '@hono/node-server';
import { buildApp } from '../src/server.js';
import { buildApiDeps, DEFAULT_DEMO_POLICY } from '../src/deps.js';

// Demo launcher for the recording. Identical to src/index.ts except it lowers the
// day cap so the spend meter renders legibly on screen — at the production
// default (100000) a handful of <=500 debits collapse into an invisible sliver.
// Honest provenance is preserved: the meter still reflects real SpendLedger rows
// against this real configured cap. maxSinglePaymentAtomic is unchanged, so the
// cap marker and per-payment ceiling stay truthful. No production code is touched.
const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';
const dbPath = process.env.CASPILOT_DB_PATH ?? './caspilot-demo.db';
const perDayCapAtomic = process.env.DEMO_DAY_CAP ?? '3000';

const policy = { ...DEFAULT_DEMO_POLICY, perDayCapAtomic };
const deps = buildApiDeps({ dbPath, policy });
const app = buildApp({ env: { expectedChainspec }, deps });
serve({ fetch: app.fetch, port });
console.log(`caspilot-api (DEMO, day cap ${perDayCapAtomic}, db ${dbPath}) listening on :${port}`);
