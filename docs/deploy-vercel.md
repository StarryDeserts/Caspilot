# Deploying Caspilot — Vercel guide (and what *not* to put on Vercel)

This is an honest deployment recommendation grounded in how the code is actually built. The short version:

| Component | Vercel? | Why | Where it should run |
|---|---|---|---|
| **`apps/web`** (Next.js 14) | ✅ **Yes — ideal fit** | Static-friendly App Router, no native deps, talks to the API only over one public URL | **Vercel** |
| **`apps/api`** (Hono) | ❌ **No (not serverless)** | Native `better-sqlite3` + on-disk SQLite + in-process `Map` state | A **persistent Node host** (Railway / Render / Fly.io / VPS) — or run locally for the demo |
| **`apps/harness`** (Tier-1 broadcast) | ❌ Not a web service | A one-shot, gated, casper-test broadcast runner | Run on demand from a laptop/CI |
| **On-chain proof** (PolicyVault + deploy hashes) | n/a | Already finalized on casper-test; permanent and explorer-verifiable | **Nothing to host** |

> **Key takeaway:** the part judges must verify — the on-chain PolicyVault enforcement — needs **no hosting at all** (see [`tier1-demo.md`](tier1-demo.md)). Vercel hosts the *showcase UI*. The API is a stateful service that does not belong on serverless without a rewrite.

---

## Part A — Deploy `apps/web` to Vercel

`apps/web` is a clean Vercel target: it depends on **only** `next`, `react`, `react-dom`, and `zod` (no workspace packages), and it reaches the backend exclusively through `NEXT_PUBLIC_CASPILOT_API_BASE`.

### 1. Project settings

In the Vercel dashboard → **New Project** → import this repo, then:

| Setting | Value |
|---|---|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `pnpm build:check` *(recommended — runs `next build` **and** the bundle-secret scan)* |
| **Install Command** | leave default (`pnpm install`) |
| **Output Directory** | leave default (`.next`) |
| **Node.js Version** | 20.x or 22.x |

**Why `pnpm build:check`?** The `web` package defines:

```jsonc
"build:check": "next build && node scripts/check-bundle-secrets.mjs .next"
```

Using it as the Vercel build command means **every deploy is gated** by the same bundle-secret scan you run locally — a privileged value or forbidden `NEXT_PUBLIC_*` name leaking into the client bundle fails the build instead of shipping. If you prefer Vercel's default, set it to plain `next build`, but you lose that guard.

### 2. pnpm + monorepo notes

- The repo pins `packageManager: "pnpm@9.12.0"` at the root. With **Root Directory = `apps/web`**, Vercel still detects the pnpm workspace (`pnpm-workspace.yaml` + root `pnpm-lock.yaml`) and installs from the workspace root. If Vercel picks the wrong pnpm major, set the version explicitly via a project env var `ENABLE_EXPERIMENTAL_COREPACK=1` (lets Vercel honor the root `packageManager` field) or pin pnpm in the project's Build settings.
- No `vercel.json` is required. Add one only if you want to override install/build commands as code instead of in the dashboard.

### 3. Environment variables

`apps/web/src/lib/env.ts` validates exactly two public variables (and **rejects** any privileged `NEXT_PUBLIC_*` name). Set both in Vercel → **Settings → Environment Variables**:

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_CASPILOT_API_BASE` | `https://caspilot-api.up.railway.app` | The public URL of your hosted `apps/api` (Part B). Must be a valid URL. |
| `NEXT_PUBLIC_CASPER_NETWORK` | `casper:casper-test` | Defaults the intent form's network field. |

> ⚠️ **Never** add a variable whose name contains `CSPR_CLOUD_KEY`, `PRIVATE_KEY`, `MNEMONIC`, `SEED`, `API_KEY`, or `FACILITATOR_SECRET` with a `NEXT_PUBLIC_` prefix — `validatePublicEnv()` is designed to throw on exactly these, because anything `NEXT_PUBLIC_*` is bundled to the browser. Privileged secrets belong only on the API host (Part B).

### 4. What the deployed UI can do

- **Landing** (`/`) and **PolicyVault drafting** (`/vaults`) work fully client-side — `/vaults` drafts a deploy payload and shows the JSON; signing is delegated to CSPR.click, so the backend never sees a key.
- **Intents** (`/intents`) and **Intent trace** (`/intents/[id]`) make live calls to `NEXT_PUBLIC_CASPILOT_API_BASE`. These only succeed once the API is hosted **and** its intent routes are enabled (Part B).

---

## Part B — `apps/api`: do **not** use Vercel serverless

### Why it is not serverless-ready

Three independent blockers, each sufficient on its own:

1. **Native module.** The payment/spend ledgers use `better-sqlite3` — a compiled native addon (ABI-locked to the Node version). Vercel serverless functions are a hostile environment for native addons, and the prebuilt ABI must match the runtime exactly.
2. **On-disk SQLite.** The ledgers are real SQLite files (WAL mode). Serverless filesystems are ephemeral and per-invocation — the database (and its `UNIQUE`-constraint replay protection) would not survive between requests.
3. **In-process state.** Intent state lives in an in-memory `Map` inside the running process. Serverless gives you a fresh, possibly-different instance per request, so an intent created in one call would not exist in the next.

This is a **stateful long-running service**, and it should run as one.

### Recommended hosts

Any platform that runs a persistent Node process with a writable disk:

| Host | Notes |
|---|---|
| **Railway** | Easiest: detects Node, persistent volume for the SQLite file, simple env UI. |
| **Render** | "Web Service" + a persistent disk mount for the DB path. |
| **Fly.io** | Good if you want a volume + region control; `fly launch` from `apps/api`. |
| **A small VPS** | Full control; run under `pm2`/systemd behind nginx/Caddy with TLS. |

Build/run commands (from `apps/api/package.json`):

```bash
pnpm install
pnpm --filter api build     # tsc → apps/api/dist
pnpm --filter api start     # node dist/index.js  (PORT, EXPECTED_CHAINSPEC from env)
```

Set a **persistent DB path** via env (see wiring below) and mount a volume there so the ledger survives restarts.

### Enabling the live API

> This is the one change that turns the API from a health-check stub into a working intent backend. It is **safe**: the API never holds a real signing key — on-chain broadcast is the harness's job. The API only does intent lifecycle + policy + spend-ledger + audit, so it uses a non-broadcasting `local_dev` signer placeholder.

**The gap:** `apps/api/src/index.ts` today builds the app *without* dependencies, so `buildApp` mounts only `/healthz` and `/version` — the `/intents` routes are never wired:

```ts
// apps/api/src/index.ts  (current)
const app = buildApp({ env: { expectedChainspec } });   // ← no deps → no /intents
```

**The fix:** assemble `IntentRouterDeps` and pass them in. This mirrors the test assembly in `apps/api/test/_stubs.ts`, but with a **persistent** SQLite path. Replace `index.ts` with:

```ts
import { serve } from '@hono/node-server';
import { buildApp } from './server.js';
import {
  openSignerGuardDb,
  makeSpendLedger,
  makeSignerGuard,
  type RawSigner,
  type SignerGuardPolicy,
} from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';

const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';

// Persistent ledger (mount a volume at this path on your host).
const dbPath = process.env.CASPILOT_DB_PATH ?? './caspilot.db';
const handle = openSignerGuardDb(dbPath);
runAuditMigrations(handle.sqlite);

const spendLedger = makeSpendLedger(handle.db);
const audit = new AuditTraceStore(handle.sqlite);

// The API never broadcasts on-chain, so it carries a non-signing local_dev
// placeholder. Real signing + broadcast happen only in apps/harness, where a
// detached signature — never the key — crosses into the deploy adapter.
const apiSigner: RawSigner = {
  signerRole: 'local_dev',
  signerPk: `01${'ab'.repeat(32)}`,
  async sign() {
    throw new Error('apps/api does not broadcast — signing belongs to the harness');
  },
};
const guard = makeSignerGuard({ spendLedger, signer: apiSigner, clock: () => Date.now() });

// Policy: load from config/env in a real deployment. Demo-safe defaults below.
const policy: SignerGuardPolicy = {
  signerRole: 'local_dev',
  allowedChainIds: ['casper:casper-test'],
  allowedContractPackages: [`00${'cc'.repeat(32)}`],
  allowedTokens: ['cspr-test-cep18'],
  receiverPolicy: 'allowlist',
  allowedReceivers: [`00${'bb'.repeat(32)}`],
  maxSinglePaymentAtomic: '500',
  perDayCapAtomic: '100000',
  requireTraceId: false,
};

const app = buildApp({ env: { expectedChainspec }, deps: { guard, policy, audit, spendLedger } });
serve({ fetch: app.fetch, port });
console.log(`caspilot-api listening on :${port}`);
```

> Wire this behind a test first (TDD): assert that `POST /intents` returns `201` and `GET /intents/:id/trace` returns the redacted trace against the assembled app, before changing `index.ts`. Then `pnpm --filter api build && pnpm --filter api start` and curl `/intents`.

### API host environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `8787`). |
| `EXPECTED_CHAINSPEC` | `casper-test` — surfaced at `/version`. |
| `CASPILOT_DB_PATH` | Path to the persistent SQLite file (mount a volume here). |

CORS: if the Vercel web origin and the API origin differ, add an allowed-origin CORS layer on the API (Hono's `cors` middleware) for the Vercel domain.

---

## Part C — the on-chain proof needs no hosting

The Tier-1 deliverable — deploy PolicyVault, one accepted `pay()`, two policy-rejected `pay()` — is **already finalized on casper-test** and permanently verifiable on [`testnet.cspr.live`](https://testnet.cspr.live). The deploy hashes in [`tier1-demo.md`](tier1-demo.md) do not depend on Vercel, the API, or anything you host. Hosting only adds the *interactive UI*; it never gates the proof.

---

## Recommended demo topology

```
   Judge's browser
        │
        ▼
  Vercel (apps/web)  ──HTTP──▶  Railway/Render (apps/api, persistent SQLite)
        │                                  (intent lifecycle + audit trace)
        │
        └──────────▶  testnet.cspr.live   (the permanent on-chain proof)
                       (PolicyVault deploys — nothing to host)
```

For a recording where you don't want to stand up a host, run the API locally (`pnpm --filter api dev`) and point a local web build at it — see [`demo-recording.md`](demo-recording.md). The on-chain proof is shown straight from the block explorer either way.

---

## Checklist

- [ ] Wire `IntentRouterDeps` into `apps/api/src/index.ts` (test-first) so `/intents` serves.
- [ ] Deploy `apps/api` to a persistent host with a mounted volume at `CASPILOT_DB_PATH`; enable CORS for the Vercel origin.
- [ ] Vercel project: Root Directory `apps/web`, build command `pnpm build:check`.
- [ ] Set `NEXT_PUBLIC_CASPILOT_API_BASE` (the API URL) and `NEXT_PUBLIC_CASPER_NETWORK` on Vercel.
- [ ] Confirm no privileged `NEXT_PUBLIC_*` secret is set anywhere.
- [ ] Smoke test: open the Vercel URL → `/intents` → create an intent → `/intents/[id]` shows the trace.
- [ ] README "Demo video" + on-chain proof links resolve.
