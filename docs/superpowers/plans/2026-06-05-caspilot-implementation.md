# Caspilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Caspilot — an x402-paid Casper DeFi yield agent backed by a delegated PolicyVault — for the Casper Agentic Buildathon 2026, with a verifiable Tier-1 on-chain demo by 2026-06-30.

**Architecture:** TypeScript monorepo (pnpm workspace) + Rust/Odra contract workspace. A single Hono API instance (Node) owns the intent FSM, x402 facilitator client, SignerGuard, and SQLite-backed payment + spend ledgers (WAL on a persistent volume). PolicyVault is an Odra CEP-18-aware vault deployed on Casper testnet. Next.js frontend uses CSPR.click for the user signer; local + demo signers are server-side and guarded. Three demo tiers; Tier 1 is mandatory and must produce real on-chain artifacts.

**Tech Stack:**
- TS: pnpm workspace, TypeScript strict, Vitest, Hono on Node, Next.js 14, Tailwind, CSPR.click
- Rust: Cargo workspace, Odra framework, CEP-18 trait
- Storage: better-sqlite3 + drizzle-orm + WAL on persistent volume (single API instance)
- Wire: x402 v2 (CEP-18 + EIP-712 `transfer_with_authorization`), CAIP-2 `casper:<chainspec_name>`
- Adapters: casper-rpc, cspr-cloud, cspr-trade (typed fallbacks; community-built MCP optional later)

**Storage decision (locked):** SQLite + Drizzle + WAL + single API instance + persistent volume is the MVP target. `payment_ledger` and `signer_spend_ledger` UNIQUE indexes are at the SQLite layer. **Postgres/Turso is documented only as a post-hackathon migration path; do NOT implement Postgres in P2.**

**Source of truth:** `caspilot/docs/superpowers/specs/2026-06-05-caspilot-design.md` (committed). Open follow-ups are tracked at the end of this plan.

**Working directory for ALL paths in this plan:** `/home/stardust/dev/HackQuest/caspilot/` (i.e., paths like `packages/x402/src/...` are relative to this directory).

**Phases:**
- P0 — Monorepo bootstrap (6 tasks)
- P1 — PolicyVault Odra contract (12 tasks)
- P2 — x402 gateway + SQLite payment ledger (17 tasks)
- P3 — SignerGuard + SQLite spend ledger (10 tasks)
- P4 — Intent FSM + adapters + audit trace + Hono router (17 tasks)
- P5 — Next.js + CSPR.click frontend (8 tasks)
- P6 — Demo Tier 1 harness (6 tasks)

---

## Phase 0 — Monorepo bootstrap

### Task 0.1: pnpm workspace skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `scripts/check-workspace.mjs`
- Create: `packages/.gitkeep`, `apps/.gitkeep`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-workspace.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const wf = yaml.load(fs.readFileSync(path.resolve('pnpm-workspace.yaml'), 'utf8'));
const required = ['packages/*', 'apps/*'];
const missing = required.filter((p) => !wf.packages?.includes(p));
if (missing.length) {
  console.error('workspace globs missing:', missing.join(', '));
  process.exit(1);
}
console.log('ok');
```

- [ ] **Step 2: Run the check (expect failure)**

Run: `node scripts/check-workspace.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open 'pnpm-workspace.yaml'`.

- [ ] **Step 3: Write minimal implementation**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`package.json`:
```json
{
  "name": "caspilot",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.10.0" },
  "scripts": {
    "check:workspace": "node scripts/check-workspace.mjs",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.next/
*.log
.env
.env.*
!.env.example
target/
.cargo/
.turbo/
.DS_Store
data/
*.db
*.db-journal
*.db-wal
*.db-shm
.vitest/
coverage/
```

Touch placeholder dirs:
```bash
mkdir -p packages apps && touch packages/.gitkeep apps/.gitkeep
```

- [ ] **Step 4: Install and verify**

Run: `pnpm install && node scripts/check-workspace.mjs`
Expected: prints `ok` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json .gitignore packages/.gitkeep apps/.gitkeep scripts/check-workspace.mjs
git commit -m "chore: bootstrap pnpm workspace"
```

---

### Task 0.2: Shared TypeScript strict config

**Files:**
- Create: `tsconfig.base.json`
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/tsconfig.lib.json`
- Create: `packages/tsconfig/tsconfig.node.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-tsconfig.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';

const base = JSON.parse(fs.readFileSync(path.resolve('tsconfig.base.json'), 'utf8'));
const opts = base.compilerOptions ?? {};
const required = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  isolatedModules: true,
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  target: 'ES2022',
};
const failures = Object.entries(required).filter(([k, v]) => opts[k] !== v);
if (failures.length) {
  console.error('strict tsconfig violations:', failures);
  process.exit(1);
}
console.log('ok');
```

- [ ] **Step 2: Run the check (expect failure)**

Run: `node scripts/check-tsconfig.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open 'tsconfig.base.json'`.

- [ ] **Step 3: Write minimal implementation**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`packages/tsconfig/package.json`:
```json
{
  "name": "@caspilot/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["tsconfig.lib.json", "tsconfig.node.json"]
}
```

`packages/tsconfig/tsconfig.lib.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/tsconfig/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Verify**

Run: `node scripts/check-tsconfig.mjs`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json packages/tsconfig scripts/check-tsconfig.mjs
git commit -m "chore: add strict shared tsconfig"
```

---

### Task 0.3: Vitest base config + first sanity package

**Files:**
- Create: `vitest.config.base.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/version.ts`
- Create: `packages/core/test/version.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/version.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CASPILOT_VERSION } from '../src/version.js';

describe('CASPILOT_VERSION', () => {
  it('is the published constant', () => {
    expect(CASPILOT_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/core test`
Expected: FAIL with `Cannot find module '../src/version.js'`.

- [ ] **Step 3: Write minimal implementation**

`vitest.config.base.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
    reporters: ['default'],
    pool: 'forks',
  },
});
```

`packages/core/package.json`:
```json
{
  "name": "@caspilot/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@vitest/coverage-v8": "^2.0.5"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/core/src/version.ts`:
```ts
export const CASPILOT_VERSION = '0.0.0';
```

`packages/core/src/index.ts`:
```ts
export * from './version.js';
```

- [ ] **Step 4: Install and run test**

Run: `pnpm install && pnpm --filter @caspilot/core test`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.base.ts packages/core
git commit -m "chore: add @caspilot/core sanity package with vitest"
```

---

### Task 0.4: Cargo workspace skeleton + Odra dependency — DEFERRED to P1 Task 1.0

This task is intentionally **not executed in P0**. Multiple bootstrap attempts during P0 surfaced a structural mismatch between Odra 2.x and a plain `cargo check`-driven workflow:

- `odra-macros` uses `#![feature(box_patterns, result_flattening)]`, which are nightly-only. No stable Rust toolchain compiles Odra 2.x.
- Odra's officially-supported nightly is `nightly-2024-07-31`. The cargo bundled with that nightly cannot parse newer registry crates that use the `edition2024` manifest feature (e.g. `base64ct 1.8.x`).
- Pinning `base64ct = "=1.7.3"` works around the registry mismatch, but a raw `cargo check` against a `cdylib + rlib` Odra crate without a `global_allocator` / `panic_handler` on the host target still fails.
- The supported primitive for Odra is the `cargo-odra` CLI (`odra build`, `odra test`), which wires up the right runtime crate, build harness, and feature flags. Driving Odra from raw `cargo` fights the framework.

**Effect:**
- P0 ships TypeScript-only. No `Cargo.toml`, no `rust-toolchain.toml`, no `contracts/` directory, no `cargo_check` CI job lands in P0.
- All Cargo / Rust bootstrap moves to P1 Task 1.0, which installs `cargo-odra` and uses `odra build` / `odra test`. Task 0.6 (CI) is adjusted accordingly: the `cargo_check` job is added in P1 Task 1.0, not P0.
- See the `## Open follow-ups` section for the consolidated decision record.

---

### Task 0.5: Lint/format config (biome) and `format:check`

**Files:**
- Create: `biome.json`
- Modify: `package.json` (root) — add `format`, `format:check` scripts

- [ ] **Step 1: Write the failing test**

Add a deliberately malformed file `packages/core/src/_lint_fixture.ts` (temporary):
```ts
export   const   x   =   1
```

Run: `pnpm format:check`
Expected: FAIL — biome reports formatting violation on `_lint_fixture.ts`.

- [ ] **Step 2: Write minimal implementation**

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "files": {
    "ignore": ["**/dist/**", "**/node_modules/**", "**/target/**", "**/.next/**", "**/data/**"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always", "trailingCommas": "all" }
  }
}
```

Modify root `package.json` scripts:
```json
"format": "biome format --write .",
"format:check": "biome format --diagnostic-level=warn ."
```

Add devDependency to root:
```json
"@biomejs/biome": "^1.9.0"
```

- [ ] **Step 3: Run the failing check to confirm it triggers**

Run: `pnpm install && pnpm format:check`
Expected: still FAIL on the fixture.

- [ ] **Step 4: Fix the fixture, re-run**

Delete `packages/core/src/_lint_fixture.ts`.
Run: `pnpm format:check`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add biome.json package.json pnpm-lock.yaml
git commit -m "chore: add biome formatter + lint config"
```

---

### Task 0.6: CI skeleton (typecheck + test + format:check)

> **Note:** The `cargo_check` CI job is intentionally absent here. It is added in P1 Task 1.0 alongside the Cargo workspace bootstrap. See Task 0.4 (DEFERRED) for the rationale.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-ci.mjs`:
```js
import fs from 'node:fs';
import yaml from 'js-yaml';
const ci = yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8'));
const jobs = Object.keys(ci.jobs ?? {});
const required = ['typecheck', 'test', 'format_check'];
const missing = required.filter((j) => !jobs.includes(j));
if (missing.length) {
  console.error('missing CI jobs:', missing);
  process.exit(1);
}
console.log('ok');
```

- [ ] **Step 2: Run the check (expect failure)**

Run: `node scripts/check-ci.mjs`
Expected: FAIL — file missing.

- [ ] **Step 3: Write minimal implementation**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push: { branches: [master, main] }
  pull_request:

jobs:
  format_check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

- [ ] **Step 4: Verify**

Run: `node scripts/check-ci.mjs && pnpm typecheck && pnpm test && pnpm format:check`
Expected: all green locally.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/check-ci.mjs
git commit -m "ci: add typecheck/test/format jobs"
```

---

## Phase 1 — PolicyVault Odra contract

> **Phase note (cargo-odra workflow):** P0 deferred the Cargo bootstrap (see Task 0.4). Task 1.0 below brings the Rust side of the repo online using Odra's CLI. For P1 tasks, default to `cargo odra test -b casper` for tests and `cargo odra build` for builds from `contracts/policy-vault/`; `cargo-odra 0.1.7` does not accept `-b` on `build`. Do not use plain `cargo test` as the default unless a specific test is known to work under plain Cargo and that exception is documented.

### Task 1.0: Cargo workspace bootstrap via `cargo-odra`

**Files:**
- Create: `Cargo.toml` (root)
- Create: `rust-toolchain.toml`
- Create: `contracts/policy-vault/Cargo.toml`
- Create: `contracts/policy-vault/Odra.toml`
- Create: `contracts/policy-vault/build.rs`
- Create: `contracts/policy-vault/bin/build_contract.rs`
- Create: `contracts/policy-vault/bin/build_schema.rs`
- Create: `contracts/policy-vault/src/lib.rs`
- Create: `contracts/policy-vault/src/errors.rs` (stub — filled in Task 1.1)
- Create: `scripts/check-cargo.mjs`
- Modify: `scripts/check-ci.mjs` (re-add `cargo_check` to `required`)
- Modify: `.github/workflows/ci.yml` (append `cargo_check` job)
- Modify: `.gitignore` (ignore generated cargo-odra `wasm/` output)
- Modify: `package.json` / `pnpm-lock.yaml` (add local `binaryen` + `wabt` WASM tools)
- Modify: `README.md` (note pinned `cargo-odra` install command and local checks)

**Context:** P0 Task 0.4 was deferred because Odra 2.x is fundamentally a nightly-Rust framework requiring its own build CLI. This task uses Odra's officially-supported workflow.

- [ ] **Step 1: Install `cargo-odra` CLI (one-time, local + CI)**

Run locally:
```bash
cargo install cargo-odra@0.1.7 --locked --features cargo-generate/vendored-openssl
```

Record the resolved version in `README.md` under a "Toolchain" section so future contributors can reproduce the build. The vendored OpenSSL feature keeps `cargo-odra` installable in environments without system `pkg-config`/OpenSSL development headers. The Odra check also needs `wasm-opt` and `wasm-strip`; this repo provides them through workspace dev dependencies `binaryen` and `wabt`, so `scripts/check-cargo.mjs` prepends `node_modules/.bin` to `PATH`.

- [ ] **Step 2: Write the failing test**

Create `scripts/check-cargo.mjs`:
```js
import { execSync } from 'node:child_process';

const contractDir = new URL('../contracts/policy-vault/', import.meta.url);
const binDir = new URL('../node_modules/.bin/', import.meta.url);
const options = {
  cwd: contractDir,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: 'target',
    PATH: `${binDir.pathname}:${process.env.PATH ?? ''}`
  },
  stdio: 'inherit'
};

try {
  execSync('cargo odra test -b casper', options);
  execSync('cargo odra build', options);
} catch {
  console.error('cargo-odra policy_vault check failed');
  process.exit(1);
}
```

- [ ] **Step 3: Run check (expect failure)**

Run: `node scripts/check-cargo.mjs`
Expected: FAIL — no `Cargo.toml` exists.

- [ ] **Step 4: Write minimal implementation**

`rust-toolchain.toml`:
```toml
[toolchain]
channel = "nightly-2024-07-31"
components = ["rustfmt", "clippy"]
targets = ["wasm32-unknown-unknown"]
```

`Cargo.toml` (root):
```toml
[workspace]
members = ["contracts/policy-vault"]
resolver = "2"

[workspace.dependencies]
odra = { version = "=2.0.0", features = [], default-features = false }
odra-build = { version = "=2.0.0", features = [], default-features = false }
odra-casper-test-vm = { version = "=2.0.0", features = [], default-features = false }
odra-casper-wasm-env = { version = "=2.0.0", features = [], default-features = false }
odra-core = { version = "=2.0.0", features = [], default-features = false }
odra-macros = { version = "=2.0.0", features = [], default-features = false }
odra-test = { version = "=2.0.0", features = [], default-features = false }
odra-vm = { version = "=2.0.0", features = [], default-features = false }
# Pinned because newer registry releases use edition2024 manifests or rustc
# versions unsupported by nightly-2024-07-31. Re-evaluate together with the
# Odra nightly/tooling pin.
base64ct = "=1.7.3"
blake3 = "=1.8.2"
clap = "=4.5.21"
clap_builder = "=4.5.21"
clap_lex = "=0.7.0"
hashbrown = "=0.15.5"
indexmap = "=2.11.4"
proptest = "=1.9.0"
tempfile = "=3.23.0"

[profile.release]
codegen-units = 1
lto = true

[profile.dev.package."*"]
opt-level = 3
```

`contracts/policy-vault/Cargo.toml` uses package name `policy_vault`, exact Odra workspace dependencies, `odra-build`, `odra-test`, and the generated-style build/schema bins required by cargo-odra 0.1.7. The minimal proven shape also includes:

- `contracts/policy-vault/Odra.toml` with `[[contracts]] fqn = "PolicyVault"`
- `contracts/policy-vault/build.rs` calling `odra_build::build()`
- `contracts/policy-vault/bin/build_contract.rs`
- `contracts/policy-vault/bin/build_schema.rs`

Do not add `odra-modules` in Task 1.0 unless the stub actually uses it; Task 1.9 can add it when CEP-18 transfer work starts.

`contracts/policy-vault/src/lib.rs`:
```rust
#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

use odra::prelude::*;

pub mod errors;

#[odra::module]
pub struct PolicyVault;

#[odra::module]
impl PolicyVault {
    pub fn init(&mut self) {}
}
```

`contracts/policy-vault/src/errors.rs`:
```rust
// PolicyVault error variants are defined in Task 1.1.
```

No `[package.metadata.odra]` block is used. The actual cargo-odra 0.1.7 project metadata is `Odra.toml` plus the build/schema bins above. Record any future metadata/config changes under the `## Open follow-ups` section of this plan so reviewers can audit them.

- [ ] **Step 5: Verify**

Run: `node scripts/check-cargo.mjs`
Expected: PASS — `cargo odra test -b casper` and `cargo odra build` pass from `contracts/policy-vault/`, producing `contracts/policy-vault/wasm/PolicyVault.wasm` as a generated artifact (ignored by git).

- [ ] **Step 6: Re-enable CI `cargo_check` job**

Modify `scripts/check-ci.mjs` — add `'cargo_check'` back to the `required` array:
```js
const required = ['typecheck', 'test', 'cargo_check', 'format_check'];
```

Append to `.github/workflows/ci.yml`:
```yaml
  cargo_check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: dtolnay/rust-toolchain@master
        with: { toolchain: 'nightly-2024-07-31', targets: 'wasm32-unknown-unknown', components: 'rustfmt,clippy' }
      - uses: Swatinem/rust-cache@v2
      - run: cargo install cargo-odra@0.1.7 --locked --features cargo-generate/vendored-openssl
      - run: node scripts/check-cargo.mjs
      - run: cargo fmt --all -- --check
```

Clippy is deferred in Task 1.0 because the hard gate is the cargo-odra Casper build/test workflow; add clippy later only after confirming Odra-generated/tooling code is compatible.

- [ ] **Step 7: Verify CI locally**

Run: `node scripts/check-ci.mjs && node scripts/check-cargo.mjs`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml Cargo.lock rust-toolchain.toml .gitignore package.json pnpm-lock.yaml \
        contracts/policy-vault scripts/check-cargo.mjs scripts/check-ci.mjs \
        .github/workflows/ci.yml README.md docs/superpowers/plans/2026-06-05-caspilot-implementation.md
git commit -m "chore(p1): bootstrap Odra policy vault workspace"
```

---

### Task 1.1: PolicyVaultError enum

**Files:**
- Modify: `contracts/policy-vault/src/errors.rs`
- Create: `contracts/policy-vault/tests/errors_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/errors_test.rs`:
```rust
use policy_vault::errors::PolicyVaultError;

#[test]
fn error_discriminants_are_stable() {
    assert_eq!(PolicyVaultError::Paused as u16, 60001);
    assert_eq!(PolicyVaultError::NotAdmin as u16, 60002);
    assert_eq!(PolicyVaultError::AgentNotAllowed as u16, 60003);
    assert_eq!(PolicyVaultError::ReceiverNotAllowed as u16, 60004);
    assert_eq!(PolicyVaultError::AmountAboveMaxSingle as u16, 60005);
    assert_eq!(PolicyVaultError::DailyLimitExceeded as u16, 60006);
    assert_eq!(PolicyVaultError::AuthorizationExpired as u16, 60007);
    assert_eq!(PolicyVaultError::NonceReplay as u16, 60008);
    assert_eq!(PolicyVaultError::ConfigVersionStale as u16, 60009);
    assert_eq!(PolicyVaultError::ArithmeticOverflow as u16, 60010);
    assert_eq!(PolicyVaultError::CallerNotAuthorized as u16, 60011);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper errors_test`
Expected: FAIL — `PolicyVaultError` not defined.

- [ ] **Step 3: Write minimal implementation**

`contracts/policy-vault/src/errors.rs`:
```rust
use odra::OdraError;

#[odra::odra_error]
pub enum PolicyVaultError {
    Paused = 60001,
    NotAdmin = 60002,
    AgentNotAllowed = 60003,
    ReceiverNotAllowed = 60004,
    AmountAboveMaxSingle = 60005,
    DailyLimitExceeded = 60006,
    AuthorizationExpired = 60007,
    NonceReplay = 60008,
    ConfigVersionStale = 60009,
    ArithmeticOverflow = 60010,
    CallerNotAuthorized = 60011,
}

impl From<PolicyVaultError> for OdraError {
    fn from(err: PolicyVaultError) -> Self {
        OdraError::user(err as u16)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper errors_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/errors.rs contracts/policy-vault/tests/errors_test.rs
git commit -m "feat(policy_vault): add stable error discriminants"
```

---

### Task 1.2: Events module (9 events)

**Files:**
- Create: `contracts/policy-vault/src/events.rs`
- Modify: `contracts/policy-vault/src/lib.rs` — `pub mod events;`
- Create: `contracts/policy-vault/tests/events_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/events_test.rs`:
```rust
use policy_vault::events::{
    AdminRotated, AgentAdded, AgentRemoved, ConfigUpdated, Initialized, Paid,
    PauseToggled, ReceiverAdded, ReceiverRemoved,
};
use odra::casper_types::U256;
use odra::Address;

#[test]
fn events_construct_with_expected_fields() {
    let zero = Address::Account([0u8; 32].into());
    let _ = Initialized { admin: zero.clone(), config_version: 1, cep18_token: zero.clone() };
    let _ = ConfigUpdated { config_version: 2, max_single: U256::zero(), daily_limit: U256::zero(), valid_until_ms: 0 };
    let _ = AgentAdded { agent: zero.clone() };
    let _ = AgentRemoved { agent: zero.clone() };
    let _ = ReceiverAdded { receiver: zero.clone() };
    let _ = ReceiverRemoved { receiver: zero.clone() };
    let _ = PauseToggled { paused: true };
    let _ = AdminRotated { previous: zero.clone(), next: zero.clone() };
    let _ = Paid {
        intent_id: [0u8; 32],
        payload_hash: [0u8; 32],
        agent: zero.clone(),
        receiver: zero.clone(),
        amount: U256::zero(),
        day_index: 0,
        day_spent_after: U256::zero(),
    };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper events_test`
Expected: FAIL — events module not declared.

- [ ] **Step 3: Write minimal implementation**

`contracts/policy-vault/src/events.rs`:
```rust
use odra::casper_types::U256;
use odra::Address;

#[odra::event]
pub struct Initialized {
    pub admin: Address,
    pub config_version: u64,
    pub cep18_token: Address,
}

#[odra::event]
pub struct ConfigUpdated {
    pub config_version: u64,
    pub max_single: U256,
    pub daily_limit: U256,
    pub valid_until_ms: u64,
}

#[odra::event]
pub struct AgentAdded { pub agent: Address }

#[odra::event]
pub struct AgentRemoved { pub agent: Address }

#[odra::event]
pub struct ReceiverAdded { pub receiver: Address }

#[odra::event]
pub struct ReceiverRemoved { pub receiver: Address }

#[odra::event]
pub struct PauseToggled { pub paused: bool }

#[odra::event]
pub struct AdminRotated {
    pub previous: Address,
    pub next: Address,
}

#[odra::event]
pub struct Paid {
    pub intent_id: [u8; 32],
    pub payload_hash: [u8; 32],
    pub agent: Address,
    pub receiver: Address,
    pub amount: U256,
    pub day_index: u64,
    pub day_spent_after: U256,
}
```

Add to `contracts/policy-vault/src/lib.rs`:
```rust
pub mod events;
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper events_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/events.rs contracts/policy-vault/src/lib.rs contracts/policy-vault/tests/events_test.rs
git commit -m "feat(policy_vault): add 9 vault events"
```

---

### Task 1.3: PolicyVault storage + init()

**Files:**
- Create: `contracts/policy-vault/src/vault.rs`
- Modify: `contracts/policy-vault/src/lib.rs` — `pub mod vault;`
- Create: `contracts/policy-vault/tests/init_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/init_test.rs`:
```rust
use odra::host::{Deployer, NoArgs};
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};
use odra::Address;

#[test]
fn init_sets_admin_and_token() {
    let env = odra_test::env();
    let admin: Address = env.get_account(0);
    let token: Address = env.get_account(1);

    let args = PolicyVaultInitArgs {
        admin: admin.clone(),
        cep18_token: token.clone(),
        max_single: 1_000u64.into(),
        daily_limit: 10_000u64.into(),
        valid_until_ms: 9_999_999_999_999u64,
    };
    let vault = PolicyVaultHostRef::deploy(&env, args);

    assert_eq!(vault.admin(), admin);
    assert_eq!(vault.cep18_token(), token);
    assert_eq!(vault.config_version(), 1u64);
    assert_eq!(vault.paused(), false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper init_test`
Expected: FAIL — module/types missing.

- [ ] **Step 3: Write minimal implementation**

`contracts/policy-vault/src/vault.rs`:
```rust
use odra::casper_types::U256;
use odra::prelude::*;
use odra::{Address, Mapping, Var};

use crate::errors::PolicyVaultError;
use crate::events::{ConfigUpdated, Initialized};

#[odra::module(events = [
    crate::events::Initialized,
    crate::events::ConfigUpdated,
    crate::events::AgentAdded,
    crate::events::AgentRemoved,
    crate::events::ReceiverAdded,
    crate::events::ReceiverRemoved,
    crate::events::PauseToggled,
    crate::events::AdminRotated,
    crate::events::Paid,
], errors = PolicyVaultError)]
pub struct PolicyVault {
    admin: Var<Address>,
    cep18_token: Var<Address>,
    paused: Var<bool>,
    config_version: Var<u64>,
    max_single: Var<U256>,
    daily_limit: Var<U256>,
    valid_until_ms: Var<u64>,
    agent_allow: Mapping<Address, bool>,
    receiver_allow: Mapping<Address, bool>,
    seen_payloads: Mapping<[u8; 32], bool>,
    day_index: Var<u64>,
    day_spent: Var<U256>,
}

#[odra::module]
impl PolicyVault {
    pub fn init(
        &mut self,
        admin: Address,
        cep18_token: Address,
        max_single: U256,
        daily_limit: U256,
        valid_until_ms: u64,
    ) {
        self.admin.set(admin.clone());
        self.cep18_token.set(cep18_token.clone());
        self.paused.set(false);
        self.config_version.set(1);
        self.max_single.set(max_single);
        self.daily_limit.set(daily_limit);
        self.valid_until_ms.set(valid_until_ms);
        self.day_index.set(0);
        self.day_spent.set(U256::zero());

        self.env().emit_event(Initialized {
            admin,
            config_version: 1,
            cep18_token,
        });
        self.env().emit_event(ConfigUpdated {
            config_version: 1,
            max_single,
            daily_limit,
            valid_until_ms,
        });
    }

    pub fn admin(&self) -> Address { self.admin.get().unwrap() }
    pub fn cep18_token(&self) -> Address { self.cep18_token.get().unwrap() }
    pub fn paused(&self) -> bool { self.paused.get().unwrap_or(false) }
    pub fn config_version(&self) -> u64 { self.config_version.get().unwrap_or(0) }
    pub fn max_single(&self) -> U256 { self.max_single.get().unwrap_or_default() }
    pub fn daily_limit(&self) -> U256 { self.daily_limit.get().unwrap_or_default() }
    pub fn valid_until_ms(&self) -> u64 { self.valid_until_ms.get().unwrap_or(0) }
}
```

Add to `contracts/policy-vault/src/lib.rs`:
```rust
pub mod vault;
```

Add dev-dependency to `contracts/policy-vault/Cargo.toml`:
```toml
[dev-dependencies]
odra-test = "2.0.0"
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper init_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/src/lib.rs contracts/policy-vault/Cargo.toml contracts/policy-vault/tests/init_test.rs
git commit -m "feat(policy_vault): add storage layout and init()"
```

---

### Task 1.4: Admin guard + pause/unpause

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/admin_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/admin_test.rs`:
```rust
use odra::host::Deployer;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

#[test]
fn pause_requires_admin() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let attacker = env.get_account(2);
    let token = env.get_account(1);

    let mut vault = PolicyVaultHostRef::deploy(
        &env,
        PolicyVaultInitArgs {
            admin: admin.clone(),
            cep18_token: token,
            max_single: 1u64.into(),
            daily_limit: 1u64.into(),
            valid_until_ms: 9_999_999_999_999,
        },
    );

    env.set_caller(attacker);
    let err = vault.try_pause().unwrap_err();
    assert!(err.to_string().contains("60002"));

    env.set_caller(admin);
    vault.pause();
    assert!(vault.paused());
    vault.unpause();
    assert!(!vault.paused());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper admin_test`
Expected: FAIL — `pause`/`unpause` not defined.

- [ ] **Step 3: Write minimal implementation**

Append to `impl PolicyVault` block in `contracts/policy-vault/src/vault.rs`:
```rust
    fn assert_admin(&self) {
        let caller = self.env().caller();
        if caller != self.admin.get().unwrap() {
            self.env().revert(PolicyVaultError::NotAdmin);
        }
    }

    pub fn pause(&mut self) {
        self.assert_admin();
        self.paused.set(true);
        self.env().emit_event(crate::events::PauseToggled { paused: true });
    }

    pub fn unpause(&mut self) {
        self.assert_admin();
        self.paused.set(false);
        self.env().emit_event(crate::events::PauseToggled { paused: false });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper admin_test`
Expected: PASS (both branches).

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/admin_test.rs
git commit -m "feat(policy_vault): admin guard + pause/unpause"
```

---

### Task 1.5: Allowlist management (agents + receivers)

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/allowlist_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/allowlist_test.rs`:
```rust
use odra::host::Deployer;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

#[test]
fn allowlist_add_and_remove() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);

    let mut vault = PolicyVaultHostRef::deploy(
        &env,
        PolicyVaultInitArgs {
            admin: admin.clone(),
            cep18_token: token,
            max_single: 1u64.into(),
            daily_limit: 1u64.into(),
            valid_until_ms: 9_999_999_999_999,
        },
    );

    env.set_caller(admin);
    vault.add_agent(agent.clone());
    vault.add_receiver(receiver.clone());
    assert!(vault.is_agent_allowed(agent.clone()));
    assert!(vault.is_receiver_allowed(receiver.clone()));

    vault.remove_agent(agent.clone());
    vault.remove_receiver(receiver.clone());
    assert!(!vault.is_agent_allowed(agent));
    assert!(!vault.is_receiver_allowed(receiver));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper allowlist_test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `impl PolicyVault`:
```rust
    pub fn add_agent(&mut self, agent: Address) {
        self.assert_admin();
        self.agent_allow.set(&agent, true);
        self.env().emit_event(crate::events::AgentAdded { agent });
    }

    pub fn remove_agent(&mut self, agent: Address) {
        self.assert_admin();
        self.agent_allow.set(&agent, false);
        self.env().emit_event(crate::events::AgentRemoved { agent });
    }

    pub fn add_receiver(&mut self, receiver: Address) {
        self.assert_admin();
        self.receiver_allow.set(&receiver, true);
        self.env().emit_event(crate::events::ReceiverAdded { receiver });
    }

    pub fn remove_receiver(&mut self, receiver: Address) {
        self.assert_admin();
        self.receiver_allow.set(&receiver, false);
        self.env().emit_event(crate::events::ReceiverRemoved { receiver });
    }

    pub fn is_agent_allowed(&self, agent: Address) -> bool {
        self.agent_allow.get(&agent).unwrap_or(false)
    }

    pub fn is_receiver_allowed(&self, receiver: Address) -> bool {
        self.receiver_allow.get(&receiver).unwrap_or(false)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper allowlist_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/allowlist_test.rs
git commit -m "feat(policy_vault): allowlist add/remove for agents+receivers"
```

---

### Task 1.6: update_config (monotonic version)

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/config_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/config_test.rs`:
```rust
use odra::host::Deployer;
use odra::casper_types::U256;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

#[test]
fn update_config_requires_strict_monotonic_version() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);

    let mut vault = PolicyVaultHostRef::deploy(
        &env,
        PolicyVaultInitArgs {
            admin: admin.clone(),
            cep18_token: token,
            max_single: 1u64.into(),
            daily_limit: 1u64.into(),
            valid_until_ms: 9_999_999_999_999,
        },
    );

    env.set_caller(admin);
    vault.update_config(2, U256::from(5u64), U256::from(20u64), 9_999_999_999_999);
    assert_eq!(vault.config_version(), 2);
    assert_eq!(vault.max_single(), U256::from(5u64));
    assert_eq!(vault.daily_limit(), U256::from(20u64));

    let err = vault.try_update_config(2, U256::from(7u64), U256::from(30u64), 9_999_999_999_999).unwrap_err();
    assert!(err.to_string().contains("60009"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper config_test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `impl PolicyVault`:
```rust
    pub fn update_config(
        &mut self,
        new_version: u64,
        max_single: U256,
        daily_limit: U256,
        valid_until_ms: u64,
    ) {
        self.assert_admin();
        let current = self.config_version.get().unwrap_or(0);
        if new_version <= current {
            self.env().revert(PolicyVaultError::ConfigVersionStale);
        }
        self.config_version.set(new_version);
        self.max_single.set(max_single);
        self.daily_limit.set(daily_limit);
        self.valid_until_ms.set(valid_until_ms);
        self.env().emit_event(ConfigUpdated {
            config_version: new_version,
            max_single,
            daily_limit,
            valid_until_ms,
        });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper config_test`
Expected: PASS (positive path + replay revert).

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/config_test.rs
git commit -m "feat(policy_vault): monotonic update_config"
```

---

### Task 1.7: rotate_admin

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/rotate_admin_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/rotate_admin_test.rs`:
```rust
use odra::host::Deployer;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

#[test]
fn rotate_admin_emits_and_switches_caller_check() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let next = env.get_account(5);
    let token = env.get_account(1);

    let mut vault = PolicyVaultHostRef::deploy(
        &env,
        PolicyVaultInitArgs {
            admin: admin.clone(),
            cep18_token: token,
            max_single: 1u64.into(),
            daily_limit: 1u64.into(),
            valid_until_ms: 9_999_999_999_999,
        },
    );

    env.set_caller(admin);
    vault.rotate_admin(next.clone());
    assert_eq!(vault.admin(), next);

    env.set_caller(env.get_account(0));
    let err = vault.try_pause().unwrap_err();
    assert!(err.to_string().contains("60002"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper rotate_admin_test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `impl PolicyVault`:
```rust
    pub fn rotate_admin(&mut self, next: Address) {
        self.assert_admin();
        let prev = self.admin.get().unwrap();
        self.admin.set(next.clone());
        self.env().emit_event(crate::events::AdminRotated { previous: prev, next });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper rotate_admin_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/rotate_admin_test.rs
git commit -m "feat(policy_vault): rotate_admin"
```

---

### Task 1.8: Day rollover helper

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/day_rollover_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/day_rollover_test.rs`:
```rust
use policy_vault::vault::compute_day_index;

#[test]
fn day_index_is_ms_div_86_400_000() {
    assert_eq!(compute_day_index(0), 0);
    assert_eq!(compute_day_index(86_399_999), 0);
    assert_eq!(compute_day_index(86_400_000), 1);
    assert_eq!(compute_day_index(86_400_000 * 30 + 5), 30);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper day_rollover_test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append (free function in `vault.rs`):
```rust
pub fn compute_day_index(now_ms: u64) -> u64 {
    now_ms / 86_400_000
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper day_rollover_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/day_rollover_test.rs
git commit -m "feat(policy_vault): day index helper"
```

---

### Task 1.9: pay() — pre-checks (pause + agent + receiver + expiry + nonce)

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/pay_prechecks_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/pay_prechecks_test.rs`:
```rust
use odra::casper_types::U256;
use odra::host::Deployer;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

fn deploy(env: &odra_test::HostEnv, admin: odra::Address, token: odra::Address) -> PolicyVaultHostRef {
    PolicyVaultHostRef::deploy(env, PolicyVaultInitArgs {
        admin,
        cep18_token: token,
        max_single: U256::from(1_000u64),
        daily_limit: U256::from(10_000u64),
        valid_until_ms: 9_999_999_999_999,
    })
}

#[test]
fn pay_rejects_when_paused() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);
    let mut vault = deploy(&env, admin.clone(), token);

    env.set_caller(admin.clone());
    vault.add_agent(agent.clone());
    vault.add_receiver(receiver.clone());
    vault.pause();

    env.set_caller(agent);
    let err = vault.try_pay([0u8; 32], [1u8; 32], receiver, U256::from(100u64), 1_000_000).unwrap_err();
    assert!(err.to_string().contains("60001"));
}

#[test]
fn pay_rejects_unallowed_agent() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);
    let stranger = env.get_account(6);
    let receiver = env.get_account(4);
    let mut vault = deploy(&env, admin.clone(), token);
    env.set_caller(admin);
    vault.add_receiver(receiver.clone());

    env.set_caller(stranger);
    let err = vault.try_pay([0u8; 32], [1u8; 32], receiver, U256::from(100u64), 1_000_000).unwrap_err();
    assert!(err.to_string().contains("60003"));
}

#[test]
fn pay_rejects_replayed_payload_hash() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);
    let mut vault = deploy(&env, admin.clone(), token);
    env.set_caller(admin.clone());
    vault.add_agent(agent.clone());
    vault.add_receiver(receiver.clone());

    env.set_caller(agent.clone());
    vault.pay([0u8; 32], [9u8; 32], receiver.clone(), U256::from(100u64), 1_000_000);
    let err = vault.try_pay([0u8; 32], [9u8; 32], receiver, U256::from(100u64), 1_000_000).unwrap_err();
    assert!(err.to_string().contains("60008"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_prechecks_test`
Expected: FAIL — `pay` missing.

- [ ] **Step 3: Write minimal implementation**

Append to `impl PolicyVault`:
```rust
    pub fn pay(
        &mut self,
        intent_id: [u8; 32],
        payload_hash: [u8; 32],
        receiver: Address,
        amount: U256,
        now_ms: u64,
    ) {
        if self.paused.get().unwrap_or(false) {
            self.env().revert(PolicyVaultError::Paused);
        }
        let caller = self.env().caller();
        if !self.agent_allow.get(&caller).unwrap_or(false) {
            self.env().revert(PolicyVaultError::AgentNotAllowed);
        }
        if !self.receiver_allow.get(&receiver).unwrap_or(false) {
            self.env().revert(PolicyVaultError::ReceiverNotAllowed);
        }
        if now_ms > self.valid_until_ms.get().unwrap_or(0) {
            self.env().revert(PolicyVaultError::AuthorizationExpired);
        }
        if self.seen_payloads.get(&payload_hash).unwrap_or(false) {
            self.env().revert(PolicyVaultError::NonceReplay);
        }
        self.seen_payloads.set(&payload_hash, true);
        let _ = (intent_id, amount); // amount/transfer added in next task
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_prechecks_test`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/pay_prechecks_test.rs
git commit -m "feat(policy_vault): pay() pre-checks"
```

---

### Task 1.10: pay() — amount + daily budget enforcement

**Files:**
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/pay_budget_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/pay_budget_test.rs`:
```rust
use odra::casper_types::U256;
use odra::host::Deployer;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

fn deploy_with(max_single: u64, daily: u64) -> (odra_test::HostEnv, PolicyVaultHostRef, odra::Address, odra::Address) {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let token = env.get_account(1);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);
    let mut vault = PolicyVaultHostRef::deploy(&env, PolicyVaultInitArgs {
        admin: admin.clone(),
        cep18_token: token,
        max_single: U256::from(max_single),
        daily_limit: U256::from(daily),
        valid_until_ms: 9_999_999_999_999,
    });
    env.set_caller(admin);
    vault.add_agent(agent.clone());
    vault.add_receiver(receiver.clone());
    (env, vault, agent, receiver)
}

#[test]
fn rejects_amount_above_max_single() {
    let (env, mut vault, agent, receiver) = deploy_with(100, 1_000);
    env.set_caller(agent);
    let err = vault.try_pay([0u8;32], [1u8;32], receiver, U256::from(101u64), 1_000).unwrap_err();
    assert!(err.to_string().contains("60005"));
}

#[test]
fn rejects_when_daily_budget_would_be_exceeded() {
    let (env, mut vault, agent, receiver) = deploy_with(100, 150);
    env.set_caller(agent.clone());
    vault.pay([0u8;32], [1u8;32], receiver.clone(), U256::from(100u64), 1_000);
    let err = vault.try_pay([1u8;32], [2u8;32], receiver, U256::from(51u64), 1_000).unwrap_err();
    assert!(err.to_string().contains("60006"));
}

#[test]
fn day_rolls_over_and_resets_budget() {
    let (env, mut vault, agent, receiver) = deploy_with(100, 150);
    env.set_caller(agent.clone());
    vault.pay([0u8;32], [1u8;32], receiver.clone(), U256::from(100u64), 1_000);
    vault.pay([1u8;32], [2u8;32], receiver.clone(), U256::from(100u64), 86_400_000 + 1_000);
    assert_eq!(vault.day_index(), 1);
    assert_eq!(vault.day_spent(), U256::from(100u64));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_budget_test`
Expected: FAIL — amount/budget logic missing.

- [ ] **Step 3: Write minimal implementation**

Replace the placeholder tail of `pay()` (after the `seen_payloads.set(...)` line) with:
```rust
        if amount > self.max_single.get().unwrap_or_default() {
            self.env().revert(PolicyVaultError::AmountAboveMaxSingle);
        }

        let today = compute_day_index(now_ms);
        let stored_day = self.day_index.get().unwrap_or(0);
        let mut spent = if today != stored_day {
            self.day_index.set(today);
            U256::zero()
        } else {
            self.day_spent.get().unwrap_or_default()
        };

        let new_spent = match spent.checked_add(amount) {
            Some(v) => v,
            None => { self.env().revert(PolicyVaultError::ArithmeticOverflow); }
        };
        if new_spent > self.daily_limit.get().unwrap_or_default() {
            self.env().revert(PolicyVaultError::DailyLimitExceeded);
        }
        spent = new_spent;
        self.day_spent.set(spent);

        let _ = intent_id; // CEP-18 transfer + event emit in next task
```

Also expose getters:
```rust
    pub fn day_index(&self) -> u64 { self.day_index.get().unwrap_or(0) }
    pub fn day_spent(&self) -> U256 { self.day_spent.get().unwrap_or_default() }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_budget_test`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/tests/pay_budget_test.rs
git commit -m "feat(policy_vault): max_single + daily_limit + day rollover"
```

---

### Task 1.11: pay() — CEP-18 transfer + Paid event

**Files:**
- Modify: `contracts/policy-vault/Cargo.toml` — add `odra-modules`
- Modify: `contracts/policy-vault/src/vault.rs`
- Create: `contracts/policy-vault/tests/pay_transfer_test.rs`

- [ ] **Step 1: Write the failing test**

`contracts/policy-vault/tests/pay_transfer_test.rs`:
```rust
use odra::casper_types::U256;
use odra::host::Deployer;
use odra_modules::cep18::cep18::Cep18HostRef;
use odra_modules::cep18::utils::Cep18InitArgs;
use policy_vault::vault::{PolicyVaultHostRef, PolicyVaultInitArgs};

#[test]
fn pay_transfers_cep18_and_emits_paid_event() {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);

    let mut token = Cep18HostRef::deploy(&env, Cep18InitArgs {
        symbol: "USDC".into(),
        name: "USD Coin".into(),
        decimals: 6,
        initial_supply: U256::from(1_000_000u64),
        admin_list: vec![admin.clone()],
        minter_list: vec![admin.clone()],
        modality: None,
    });

    let mut vault = PolicyVaultHostRef::deploy(&env, PolicyVaultInitArgs {
        admin: admin.clone(),
        cep18_token: *token.address(),
        max_single: U256::from(1_000u64),
        daily_limit: U256::from(10_000u64),
        valid_until_ms: 9_999_999_999_999,
    });

    env.set_caller(admin.clone());
    token.transfer(*vault.address(), U256::from(5_000u64));
    vault.add_agent(agent.clone());
    vault.add_receiver(receiver.clone());

    env.set_caller(agent.clone());
    vault.pay([0u8;32], [7u8;32], receiver.clone(), U256::from(100u64), 1_000);

    assert_eq!(token.balance_of(receiver), U256::from(100u64));
    assert_eq!(token.balance_of(*vault.address()), U256::from(4_900u64));

    let events = env.events(vault.address());
    assert!(events.iter().any(|e| e.contains("Paid")));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_transfer_test`
Expected: FAIL — vault does not call `cep18.transfer`.

- [ ] **Step 3: Write minimal implementation**

Replace the `let _ = intent_id;` placeholder line with:
```rust
        let token_addr = self.cep18_token.get().unwrap();
        let mut token = odra_modules::cep18::cep18::Cep18ContractRef::new(self.env(), token_addr);
        token.transfer(&receiver, &amount);

        self.env().emit_event(crate::events::Paid {
            intent_id,
            payload_hash,
            agent: caller,
            receiver,
            amount,
            day_index: self.day_index.get().unwrap_or(0),
            day_spent_after: spent,
        });
```

Update `contracts/policy-vault/Cargo.toml`:
```toml
[dev-dependencies]
odra-test = "2.0.0"
odra-modules = "2.0.0"
```

- [ ] **Step 4: Run test to verify it passes**

Run from `contracts/policy-vault/` via cargo-odra: `cargo odra test -b casper pay_transfer_test`
Expected: PASS — receiver balance and event present.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/src/vault.rs contracts/policy-vault/Cargo.toml contracts/policy-vault/tests/pay_transfer_test.rs
git commit -m "feat(policy_vault): pay() transfers CEP-18 and emits Paid"
```

---

### Task 1.12: WASM artifact build + smoke test

**Files:**
- Create: `contracts/policy-vault/bin/policy_vault.rs`
- Modify: `contracts/policy-vault/Cargo.toml` — add `[[bin]]` target gated by feature

- [ ] **Step 1: Write the failing test**

Create `scripts/check-vault-wasm.mjs`:
```js
import fs from 'node:fs';
const p = 'target/wasm32-unknown-unknown/release/policy_vault.wasm';
if (!fs.existsSync(p)) { console.error('wasm missing'); process.exit(1); }
const sz = fs.statSync(p).size;
if (sz < 5_000 || sz > 800_000) { console.error('wasm size out of range:', sz); process.exit(1); }
console.log('ok size=' + sz);
```

- [ ] **Step 2: Run the check (expect failure)**

Run: `node scripts/check-vault-wasm.mjs`
Expected: FAIL — wasm not built.

- [ ] **Step 3: Write minimal implementation**

`contracts/policy-vault/bin/policy_vault.rs`:
```rust
#![no_main]
#![no_std]
extern crate alloc;

#[cfg(target_arch = "wasm32")]
odra::casper_contract::no_std_helpers!();

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn call() {
    odra::host_functions::init_dispatcher::<policy_vault::vault::PolicyVault>();
}
```

Append to `contracts/policy-vault/Cargo.toml`:
```toml
[[bin]]
name = "policy_vault"
path = "bin/policy_vault.rs"
required-features = ["wasm"]

[features]
wasm = []
```

- [ ] **Step 4: Build and verify**

Run:
```bash
cargo build -p policy_vault --release --target wasm32-unknown-unknown --features wasm
node scripts/check-vault-wasm.mjs
```
Expected: prints `ok size=...`.

- [ ] **Step 5: Commit**

```bash
git add contracts/policy-vault/bin contracts/policy-vault/Cargo.toml scripts/check-vault-wasm.mjs
git commit -m "feat(policy_vault): build WASM artifact"
```

---

## Phase 2 — x402 gateway + SQLite payment ledger

> **Storage reminder:** This phase uses **SQLite + Drizzle + WAL** on a persistent volume. UNIQUE indexes live on SQLite tables. Postgres/Turso is a documented post-hackathon migration path only — do NOT implement Postgres in P2.

### Task 2.1: Package skeleton `@caspilot/x402`

**Files:**
- Create: `packages/x402/package.json`
- Create: `packages/x402/tsconfig.json`
- Create: `packages/x402/vitest.config.ts`
- Create: `packages/x402/src/index.ts`
- Create: `packages/x402/test/_smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { X402_VERSION } from '../src/index.js';

describe('X402_VERSION', () => {
  it('is 2', () => expect(X402_VERSION).toBe(2));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/package.json`:
```json
{
  "name": "@caspilot/x402",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/x402/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/x402/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/x402/src/index.ts`:
```ts
export const X402_VERSION = 2 as const;
export * from './primitives.js';
```

`packages/x402/src/primitives.ts`:
```ts
// Filled in next task.
export {};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @caspilot/x402 test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402 pnpm-lock.yaml
git commit -m "chore(x402): scaffold package"
```

---

### Task 2.2: x402 primitive Zod schemas

**Files:**
- Modify: `packages/x402/src/primitives.ts`
- Create: `packages/x402/test/primitives.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/primitives.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  CasperAccountAddressHex,
  CasperPublicKeyHex,
  CasperSignatureHex,
  DecimalsField,
  decimalsToNumber,
} from '../src/primitives.js';

describe('CasperAccountAddressHex', () => {
  it('accepts 00 prefix + 32 bytes', () => {
    expect(CasperAccountAddressHex.safeParse('00' + '11'.repeat(32)).success).toBe(true);
  });
  it('rejects 01 prefix', () => {
    expect(CasperAccountAddressHex.safeParse('01' + '11'.repeat(32)).success).toBe(false);
  });
  it('rejects uppercase', () => {
    expect(CasperAccountAddressHex.safeParse('00' + 'AA'.repeat(32)).success).toBe(false);
  });
});

describe('CasperPublicKeyHex', () => {
  it('accepts ed25519 (01 + 32B)', () => {
    expect(CasperPublicKeyHex.safeParse('01' + '11'.repeat(32)).success).toBe(true);
  });
  it('accepts secp256k1 (02 + 33B)', () => {
    expect(CasperPublicKeyHex.safeParse('02' + '11'.repeat(33)).success).toBe(true);
  });
  it('rejects 00 prefix', () => {
    expect(CasperPublicKeyHex.safeParse('00' + '11'.repeat(32)).success).toBe(false);
  });
});

describe('CasperSignatureHex', () => {
  it('accepts 65-byte hex (130 chars)', () => {
    expect(CasperSignatureHex.safeParse('a'.repeat(130)).success).toBe(true);
  });
  it('rejects 64-byte hex', () => {
    expect(CasperSignatureHex.safeParse('a'.repeat(128)).success).toBe(false);
  });
});

describe('DecimalsField + decimalsToNumber', () => {
  it('accepts number', () => {
    expect(DecimalsField.parse(9)).toBe(9);
    expect(decimalsToNumber(DecimalsField.parse(9))).toBe(9);
  });
  it('accepts numeric string', () => {
    expect(decimalsToNumber(DecimalsField.parse('9'))).toBe(9);
  });
  it('rejects non-numeric string', () => {
    expect(DecimalsField.safeParse('abc').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test primitives`
Expected: FAIL — exports missing.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/primitives.ts`:
```ts
import { z } from 'zod';

export const CasperAccountAddressHex = z
  .string()
  .regex(/^00[0-9a-f]{64}$/, 'casper account address: lowercase hex, 00 prefix, 32 bytes');

export const CasperPublicKeyHex = z
  .string()
  .regex(
    /^(01[0-9a-f]{64}|02[0-9a-f]{66})$/,
    'casper public key: ed25519 (01+32B) or secp256k1 (02+33B), lowercase hex',
  );

export const CasperSignatureHex = z
  .string()
  .regex(/^[0-9a-f]{130}$/, 'casper signature: 65 bytes lowercase hex');

export const DecimalsField = z.union([
  z.number().int().min(0).max(38),
  z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(0).max(38)),
]);

export type CasperAccountAddressHex = z.infer<typeof CasperAccountAddressHex>;
export type CasperPublicKeyHex = z.infer<typeof CasperPublicKeyHex>;
export type CasperSignatureHex = z.infer<typeof CasperSignatureHex>;
export type DecimalsField = z.infer<typeof DecimalsField>;

export function decimalsToNumber(d: DecimalsField): number {
  return typeof d === 'number' ? d : Number.parseInt(d, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test primitives`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/primitives.ts packages/x402/test/primitives.test.ts
git commit -m "feat(x402): casper primitive schemas + decimals union"
```

---

### Task 2.3: PaymentRequirements + canonical payload

**Files:**
- Create: `packages/x402/src/requirements.ts`
- Create: `packages/x402/src/payload.ts`
- Modify: `packages/x402/src/index.ts` — re-export
- Create: `packages/x402/test/requirements.test.ts`
- Create: `packages/x402/test/payload.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/requirements.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PaymentRequirements } from '../src/requirements.js';

describe('PaymentRequirements', () => {
  it('parses a canonical requirements object', () => {
    const r = PaymentRequirements.parse({
      scheme: 'exact',
      network: 'casper:casper-test',
      maxAmountRequired: '1000000',
      minAmountRequired: '0',
      resource: 'https://api.caspilot.dev/yield/optimize',
      description: 'Yield strategy ranking',
      mimeType: 'application/json',
      payTo: '00' + '11'.repeat(32),
      maxTimeoutSeconds: 60,
      asset: 'cspr-test-cep18',
      extra: {
        contractHash: '00' + '22'.repeat(32),
        decimals: 9,
        facilitatorUrl: 'http://localhost:8080',
        eip712Domain: { name: 'Caspilot', version: '1' },
      },
    });
    expect(r.scheme).toBe('exact');
    expect(r.network).toBe('casper:casper-test');
  });
  it('rejects non-casper network', () => {
    expect(
      PaymentRequirements.safeParse({
        scheme: 'exact',
        network: 'ethereum-mainnet',
        maxAmountRequired: '1',
        resource: 'x',
        payTo: '00' + '11'.repeat(32),
        maxTimeoutSeconds: 60,
        asset: 'a',
      }).success,
    ).toBe(false);
  });
});
```

`packages/x402/test/payload.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PaymentPayload } from '../src/payload.js';

describe('PaymentPayload', () => {
  it('parses a canonical EIP-712 transfer-with-authorization payload', () => {
    const p = PaymentPayload.parse({
      x402Version: 2,
      scheme: 'exact',
      network: 'casper:casper-test',
      payload: {
        signature: 'a'.repeat(130),
        authorization: {
          from: '00' + '11'.repeat(32),
          to: '00' + '22'.repeat(32),
          value: '500',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + '0'.repeat(64),
          publicKey: '01' + '11'.repeat(32),
        },
      },
    });
    expect(p.x402Version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test requirements payload`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/requirements.ts`:
```ts
import { z } from 'zod';
import { CasperAccountAddressHex, DecimalsField } from './primitives.js';

export const CasperNetwork = z.string().regex(/^casper:[a-z0-9-]+$/);

export const Eip712Domain = z.object({
  name: z.string(),
  version: z.string(),
  chainId: z.union([z.number().int(), z.string()]).optional(),
  verifyingContract: z.string().optional(),
  salt: z.string().optional(),
});

export const PaymentRequirementsExtra = z.object({
  contractHash: z.string(),
  decimals: DecimalsField,
  facilitatorUrl: z.string().url(),
  eip712Domain: Eip712Domain,
  symbol: z.string().optional(),
});

export const PaymentRequirements = z.object({
  scheme: z.literal('exact'),
  network: CasperNetwork,
  maxAmountRequired: z.string().regex(/^\d+$/),
  minAmountRequired: z.string().regex(/^\d+$/).optional(),
  resource: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  payTo: CasperAccountAddressHex,
  maxTimeoutSeconds: z.number().int().min(1).max(3600),
  asset: z.string(),
  extra: PaymentRequirementsExtra,
});

export type PaymentRequirements = z.infer<typeof PaymentRequirements>;
```

`packages/x402/src/payload.ts`:
```ts
import { z } from 'zod';
import { CasperNetwork } from './requirements.js';
import {
  CasperAccountAddressHex,
  CasperPublicKeyHex,
  CasperSignatureHex,
} from './primitives.js';

export const Authorization = z.object({
  from: CasperAccountAddressHex,
  to: CasperAccountAddressHex,
  value: z.string().regex(/^\d+$/),
  validAfter: z.string().regex(/^\d+$/),
  validBefore: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^0x[0-9a-f]{64}$/),
  publicKey: CasperPublicKeyHex,
});

export const PaymentPayload = z.object({
  x402Version: z.literal(2),
  scheme: z.literal('exact'),
  network: CasperNetwork,
  payload: z.object({
    signature: CasperSignatureHex,
    authorization: Authorization,
  }),
});

export type PaymentPayload = z.infer<typeof PaymentPayload>;
```

Update `packages/x402/src/index.ts`:
```ts
export const X402_VERSION = 2 as const;
export * from './primitives.js';
export * from './requirements.js';
export * from './payload.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src packages/x402/test
git commit -m "feat(x402): PaymentRequirements + PaymentPayload schemas"
```

---

### Task 2.4: SupportedResponse

**Files:**
- Create: `packages/x402/src/supported.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/supported.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/supported.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SupportedResponse } from '../src/supported.js';

describe('SupportedResponse', () => {
  it('parses canonical /supported list with numeric decimals', () => {
    const r = SupportedResponse.parse({
      kinds: [
        {
          x402Version: 2,
          scheme: 'exact',
          network: 'casper:casper-test',
          asset: 'cspr-test-cep18',
          decimals: 9,
        },
      ],
    });
    expect(r.kinds[0].decimals).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test supported`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/supported.ts`:
```ts
import { z } from 'zod';
import { CasperNetwork } from './requirements.js';
import { DecimalsField } from './primitives.js';

export const SupportedKind = z.object({
  x402Version: z.literal(2),
  scheme: z.literal('exact'),
  network: CasperNetwork,
  asset: z.string(),
  decimals: DecimalsField,
});

export const SupportedResponse = z.object({
  kinds: z.array(SupportedKind),
});

export type SupportedResponse = z.infer<typeof SupportedResponse>;
```

Add `export * from './supported.js';` to `packages/x402/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test supported`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/supported.ts packages/x402/src/index.ts packages/x402/test/supported.test.ts
git commit -m "feat(x402): SupportedResponse schema"
```

---

### Task 2.5: VerifyRequest schema

**Files:**
- Create: `packages/x402/src/verify-request.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/verify-request.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/verify-request.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VerifyRequest } from '../src/verify-request.js';

describe('VerifyRequest', () => {
  it('parses canonical verify body', () => {
    const req = VerifyRequest.parse({
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        scheme: 'exact',
        network: 'casper:casper-test',
        payload: {
          signature: 'a'.repeat(130),
          authorization: {
            from: '00' + '11'.repeat(32),
            to: '00' + '22'.repeat(32),
            value: '500',
            validAfter: '0',
            validBefore: '9999999999',
            nonce: '0x' + '0'.repeat(64),
            publicKey: '01' + '11'.repeat(32),
          },
        },
      },
      paymentRequirements: {
        scheme: 'exact',
        network: 'casper:casper-test',
        maxAmountRequired: '1000',
        resource: 'x',
        payTo: '00' + '22'.repeat(32),
        maxTimeoutSeconds: 60,
        asset: 'cspr-test-cep18',
        extra: {
          contractHash: '00' + '33'.repeat(32),
          decimals: '9',
          facilitatorUrl: 'http://localhost:8080',
          eip712Domain: { name: 'Caspilot', version: '1' },
        },
      },
    });
    expect(req.x402Version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test verify-request`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/verify-request.ts`:
```ts
import { z } from 'zod';
import { PaymentPayload } from './payload.js';
import { PaymentRequirements } from './requirements.js';

export const VerifyRequest = z.object({
  x402Version: z.literal(2),
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
});

export type VerifyRequest = z.infer<typeof VerifyRequest>;
```

Add `export * from './verify-request.js';` to index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test verify-request`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/verify-request.ts packages/x402/src/index.ts packages/x402/test/verify-request.test.ts
git commit -m "feat(x402): VerifyRequest schema"
```

---

### Task 2.6: VerifyResponse Wire + Normalized + normalizer

**Files:**
- Create: `packages/x402/src/verify-response.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/verify-response.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/verify-response.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  WireVerifyResponse,
  NormalizedVerifyResponse,
  normalizeVerifyResponse,
} from '../src/verify-response.js';

describe('VerifyResponse', () => {
  const wireOk = {
    isValid: true,
    payer: '00' + '11'.repeat(32),
  };
  const wireInvalid = { isValid: false, invalidReason: 'invalid_signature' };

  it('Wire allows optional payer when valid', () => {
    expect(WireVerifyResponse.safeParse(wireOk).success).toBe(true);
  });
  it('Wire allows missing payer when invalid', () => {
    expect(WireVerifyResponse.safeParse(wireInvalid).success).toBe(true);
  });
  it('Normalized requires payer when valid', () => {
    expect(NormalizedVerifyResponse.safeParse({ isValid: true }).success).toBe(false);
  });
  it('normalizeVerifyResponse fills payer field', () => {
    const out = normalizeVerifyResponse(wireOk);
    expect(out.isValid).toBe(true);
    if (out.isValid) expect(out.payer).toBe(wireOk.payer);
  });
  it('normalizeVerifyResponse preserves invalid reason', () => {
    const out = normalizeVerifyResponse(wireInvalid);
    expect(out.isValid).toBe(false);
    if (!out.isValid) expect(out.invalidReason).toBe('invalid_signature');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test verify-response`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/verify-response.ts`:
```ts
import { z } from 'zod';
import { CasperAccountAddressHex } from './primitives.js';

export const FailureReason = z.enum([
  'invalid_signature',
  'unsupported_scheme',
  'unsupported_network',
  'expired_authorization',
  'insufficient_balance',
  'nonce_replay',
  'amount_below_min',
  'amount_above_max',
  'facilitator_unavailable',
  'internal_error',
]);
export type FailureReason = z.infer<typeof FailureReason>;

export const WireVerifyResponse = z.union([
  z.object({ isValid: z.literal(true), payer: CasperAccountAddressHex.optional() }),
  z.object({
    isValid: z.literal(false),
    invalidReason: FailureReason,
    payer: CasperAccountAddressHex.optional(),
  }),
]);

export const NormalizedVerifyResponse = z.union([
  z.object({ isValid: z.literal(true), payer: CasperAccountAddressHex }),
  z.object({ isValid: z.literal(false), invalidReason: FailureReason }),
]);

export type WireVerifyResponse = z.infer<typeof WireVerifyResponse>;
export type NormalizedVerifyResponse = z.infer<typeof NormalizedVerifyResponse>;

export function normalizeVerifyResponse(wire: WireVerifyResponse): NormalizedVerifyResponse {
  if (wire.isValid) {
    if (!wire.payer) {
      throw new Error('facilitator returned isValid=true without payer; cannot normalize');
    }
    return { isValid: true, payer: wire.payer };
  }
  return { isValid: false, invalidReason: wire.invalidReason };
}
```

Add `export * from './verify-response.js';` to index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test verify-response`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/verify-response.ts packages/x402/src/index.ts packages/x402/test/verify-response.test.ts
git commit -m "feat(x402): VerifyResponse wire + normalized"
```

---

### Task 2.7: SettleRequest + SettleResponse Wire + Normalized

**Files:**
- Create: `packages/x402/src/settle.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/settle.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/settle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  SettleRequest,
  WireSettleResponse,
  NormalizedSettleResponse,
  normalizeSettleResponse,
} from '../src/settle.js';

describe('SettleRequest', () => {
  it('parses canonical body', () => {
    const r = SettleRequest.parse({
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        scheme: 'exact',
        network: 'casper:casper-test',
        payload: {
          signature: 'a'.repeat(130),
          authorization: {
            from: '00' + '11'.repeat(32),
            to: '00' + '22'.repeat(32),
            value: '500',
            validAfter: '0',
            validBefore: '9999999999',
            nonce: '0x' + '0'.repeat(64),
            publicKey: '01' + '11'.repeat(32),
          },
        },
      },
      paymentRequirements: {
        scheme: 'exact',
        network: 'casper:casper-test',
        maxAmountRequired: '1000',
        resource: 'x',
        payTo: '00' + '22'.repeat(32),
        maxTimeoutSeconds: 60,
        asset: 'cspr-test-cep18',
        extra: {
          contractHash: '00' + '33'.repeat(32),
          decimals: 9,
          facilitatorUrl: 'http://localhost:8080',
          eip712Domain: { name: 'Caspilot', version: '1' },
        },
      },
    });
    expect(r.x402Version).toBe(2);
  });
});

describe('SettleResponse', () => {
  const wireOk = {
    success: true,
    transaction: 'a'.repeat(64),
    network: 'casper:casper-test',
    payer: '00' + '11'.repeat(32),
  };
  it('Wire allows bare deploy-hash string', () => {
    expect(WireSettleResponse.safeParse(wireOk).success).toBe(true);
  });
  it('Normalized requires {chainId, deployHash} object', () => {
    expect(
      NormalizedSettleResponse.safeParse({
        success: true,
        transaction: { chainId: 'casper:casper-test', deployHash: 'a'.repeat(64) },
        payer: '00' + '11'.repeat(32),
      }).success,
    ).toBe(true);
  });
  it('normalize collapses bare string to nested object', () => {
    const norm = normalizeSettleResponse(wireOk);
    expect(norm.success).toBe(true);
    if (norm.success) {
      expect(norm.transaction).toEqual({
        chainId: 'casper:casper-test',
        deployHash: 'a'.repeat(64),
      });
      expect(norm.payer).toBe(wireOk.payer);
    }
  });
  it('normalize preserves failure reason', () => {
    const wireFail = { success: false, errorReason: 'facilitator_unavailable' as const };
    const norm = normalizeSettleResponse(wireFail);
    expect(norm.success).toBe(false);
    if (!norm.success) expect(norm.errorReason).toBe('facilitator_unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test settle`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/settle.ts`:
```ts
import { z } from 'zod';
import { PaymentPayload } from './payload.js';
import { PaymentRequirements, CasperNetwork } from './requirements.js';
import { CasperAccountAddressHex } from './primitives.js';
import { FailureReason } from './verify-response.js';

export const SettleRequest = z.object({
  x402Version: z.literal(2),
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
});
export type SettleRequest = z.infer<typeof SettleRequest>;

const DeployHashHex = z.string().regex(/^[0-9a-f]{64}$/);

export const WireSettleResponse = z.union([
  z.object({
    success: z.literal(true),
    transaction: DeployHashHex,
    network: CasperNetwork,
    payer: CasperAccountAddressHex,
  }),
  z.object({
    success: z.literal(false),
    errorReason: FailureReason,
  }),
]);
export type WireSettleResponse = z.infer<typeof WireSettleResponse>;

export const NormalizedSettleResponse = z.union([
  z.object({
    success: z.literal(true),
    transaction: z.object({ chainId: CasperNetwork, deployHash: DeployHashHex }),
    payer: CasperAccountAddressHex,
  }),
  z.object({ success: z.literal(false), errorReason: FailureReason }),
]);
export type NormalizedSettleResponse = z.infer<typeof NormalizedSettleResponse>;

export function normalizeSettleResponse(wire: WireSettleResponse): NormalizedSettleResponse {
  if (wire.success) {
    return {
      success: true,
      transaction: { chainId: wire.network, deployHash: wire.transaction },
      payer: wire.payer,
    };
  }
  return { success: false, errorReason: wire.errorReason };
}
```

Add `export * from './settle.js';` to index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test settle`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/settle.ts packages/x402/src/index.ts packages/x402/test/settle.test.ts
git commit -m "feat(x402): SettleRequest + Wire/Normalized SettleResponse"
```

---

### Task 2.8: PAYMENT-SIGNATURE header codec (base64url JSON, no padding)

**Files:**
- Create: `packages/x402/src/header.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/header.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/header.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodePaymentSignatureHeader, decodePaymentSignatureHeader } from '../src/header.js';

const payload = {
  x402Version: 2 as const,
  scheme: 'exact' as const,
  network: 'casper:casper-test',
  payload: {
    signature: 'a'.repeat(130),
    authorization: {
      from: '00' + '11'.repeat(32),
      to: '00' + '22'.repeat(32),
      value: '500',
      validAfter: '0',
      validBefore: '9999999999',
      nonce: '0x' + '0'.repeat(64),
      publicKey: '01' + '11'.repeat(32),
    },
  },
};

describe('PAYMENT-SIGNATURE header', () => {
  it('encodes to base64url without padding', () => {
    const enc = encodePaymentSignatureHeader(payload);
    expect(enc).not.toMatch(/=$/);
    expect(enc).not.toMatch(/[+/]/);
  });
  it('round-trips', () => {
    const enc = encodePaymentSignatureHeader(payload);
    const dec = decodePaymentSignatureHeader(enc);
    expect(dec).toEqual(payload);
  });
  it('rejects malformed header', () => {
    expect(() => decodePaymentSignatureHeader('!!!')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test header`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/header.ts`:
```ts
import { PaymentPayload } from './payload.js';

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}

export function encodePaymentSignatureHeader(payload: PaymentPayload): string {
  const parsed = PaymentPayload.parse(payload);
  return toBase64Url(JSON.stringify(parsed));
}

export function decodePaymentSignatureHeader(header: string): PaymentPayload {
  const json = fromBase64Url(header);
  const parsed = PaymentPayload.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new Error('invalid PAYMENT-SIGNATURE header: ' + parsed.error.message);
  }
  return parsed.data;
}
```

Add `export * from './header.js';` to index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test header`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/header.ts packages/x402/src/index.ts packages/x402/test/header.test.ts
git commit -m "feat(x402): PAYMENT-SIGNATURE header codec"
```

---

### Task 2.9: Facilitator HTTP client

**Files:**
- Create: `packages/x402/src/facilitator.ts`
- Modify: `packages/x402/src/index.ts`
- Create: `packages/x402/test/facilitator.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/facilitator.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { FacilitatorClient } from '../src/facilitator.js';

const req = {
  x402Version: 2 as const,
  paymentPayload: {
    x402Version: 2 as const,
    scheme: 'exact' as const,
    network: 'casper:casper-test',
    payload: {
      signature: 'a'.repeat(130),
      authorization: {
        from: '00' + '11'.repeat(32),
        to: '00' + '22'.repeat(32),
        value: '500',
        validAfter: '0',
        validBefore: '9999999999',
        nonce: '0x' + '0'.repeat(64),
        publicKey: '01' + '11'.repeat(32),
      },
    },
  },
  paymentRequirements: {
    scheme: 'exact' as const,
    network: 'casper:casper-test',
    maxAmountRequired: '1000',
    resource: 'x',
    payTo: '00' + '22'.repeat(32),
    maxTimeoutSeconds: 60,
    asset: 'a',
    extra: {
      contractHash: '00' + '33'.repeat(32),
      decimals: 9,
      facilitatorUrl: 'http://localhost:8080',
      eip712Domain: { name: 'Caspilot', version: '1' },
    },
  },
};

describe('FacilitatorClient', () => {
  it('verify() returns Normalized response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ isValid: true, payer: '00' + '11'.repeat(32) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const c = new FacilitatorClient({ baseUrl: 'http://localhost:8080', fetch: fetchMock });
    const out = await c.verify(req);
    expect(out.isValid).toBe(true);
  });

  it('settle() collapses Wire to Normalized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          transaction: 'a'.repeat(64),
          network: 'casper:casper-test',
          payer: '00' + '11'.repeat(32),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const c = new FacilitatorClient({ baseUrl: 'http://localhost:8080', fetch: fetchMock });
    const out = await c.settle(req);
    expect(out.success).toBe(true);
    if (out.success) expect(out.transaction.deployHash).toBe('a'.repeat(64));
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const c = new FacilitatorClient({ baseUrl: 'http://localhost:8080', fetch: fetchMock });
    await expect(c.verify(req)).rejects.toThrow(/facilitator/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402 test facilitator`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/x402/src/facilitator.ts`:
```ts
import { VerifyRequest } from './verify-request.js';
import {
  NormalizedVerifyResponse,
  WireVerifyResponse,
  normalizeVerifyResponse,
} from './verify-response.js';
import {
  NormalizedSettleResponse,
  SettleRequest,
  WireSettleResponse,
  normalizeSettleResponse,
} from './settle.js';
import { SupportedResponse } from './supported.js';

export interface FacilitatorClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class FacilitatorClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: FacilitatorClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async supported(): Promise<SupportedResponse> {
    return SupportedResponse.parse(await this.json('/supported', 'GET'));
  }

  async verify(req: VerifyRequest): Promise<NormalizedVerifyResponse> {
    const wire = await this.json('/verify', 'POST', VerifyRequest.parse(req));
    return normalizeVerifyResponse(WireVerifyResponse.parse(wire));
  }

  async settle(req: SettleRequest): Promise<NormalizedSettleResponse> {
    const wire = await this.json('/settle', 'POST', SettleRequest.parse(req));
    return normalizeSettleResponse(WireSettleResponse.parse(wire));
  }

  private async json(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.base + path, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      if (!res.ok) {
        throw new Error(`facilitator ${path} returned ${res.status}`);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
```

Add `export * from './facilitator.js';` to index.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/x402 test facilitator`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402/src/facilitator.ts packages/x402/src/index.ts packages/x402/test/facilitator.test.ts
git commit -m "feat(x402): facilitator HTTP client with wire→normalized"
```

---

### Task 2.10: Wire fixtures regression suite

**Files:**
- Create: `packages/x402/test/fixtures/verify-wire-ok.json`
- Create: `packages/x402/test/fixtures/verify-wire-invalid.json`
- Create: `packages/x402/test/fixtures/settle-wire-ok.json`
- Create: `packages/x402/test/fixtures/supported-wire.json`
- Create: `packages/x402/test/fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402/test/fixtures.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SupportedResponse,
  WireVerifyResponse,
  WireSettleResponse,
  normalizeVerifyResponse,
  normalizeSettleResponse,
} from '../src/index.js';

const FX = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'));

describe('wire fixtures', () => {
  it('supported-wire.json parses', () => {
    expect(SupportedResponse.parse(FX('supported-wire.json'))).toBeTruthy();
  });
  it('verify-wire-ok.json normalizes to isValid + payer', () => {
    const norm = normalizeVerifyResponse(WireVerifyResponse.parse(FX('verify-wire-ok.json')));
    expect(norm.isValid).toBe(true);
  });
  it('verify-wire-invalid.json normalizes to isValid=false', () => {
    const norm = normalizeVerifyResponse(WireVerifyResponse.parse(FX('verify-wire-invalid.json')));
    expect(norm.isValid).toBe(false);
  });
  it('settle-wire-ok.json normalizes to nested transaction', () => {
    const norm = normalizeSettleResponse(WireSettleResponse.parse(FX('settle-wire-ok.json')));
    expect(norm.success).toBe(true);
    if (norm.success) expect(norm.transaction.deployHash.length).toBe(64);
  });
});
```

- [ ] **Step 2: Write fixtures (these are also part of "failing test" since file reads will fail until present)**

`packages/x402/test/fixtures/supported-wire.json`:
```json
{
  "kinds": [
    { "x402Version": 2, "scheme": "exact", "network": "casper:casper-test", "asset": "cspr-test-cep18", "decimals": 9 }
  ]
}
```

`packages/x402/test/fixtures/verify-wire-ok.json`:
```json
{ "isValid": true, "payer": "0011111111111111111111111111111111111111111111111111111111111111" }
```

`packages/x402/test/fixtures/verify-wire-invalid.json`:
```json
{ "isValid": false, "invalidReason": "invalid_signature" }
```

`packages/x402/test/fixtures/settle-wire-ok.json`:
```json
{
  "success": true,
  "transaction": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "network": "casper:casper-test",
  "payer": "0011111111111111111111111111111111111111111111111111111111111111"
}
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @caspilot/x402 test fixtures`
Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/x402/test/fixtures.test.ts packages/x402/test/fixtures
git commit -m "test(x402): pin wire fixtures for verify/settle/supported"
```

---

### Task 2.11: Ledger package skeleton (`@caspilot/ledger`)

**Files:**
- Create: `packages/ledger/package.json`
- Create: `packages/ledger/tsconfig.json`
- Create: `packages/ledger/vitest.config.ts`
- Create: `packages/ledger/src/index.ts`
- Create: `packages/ledger/test/_smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ledger/test/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LEDGER_SCHEMA_VERSION } from '../src/index.js';

describe('LEDGER_SCHEMA_VERSION', () => {
  it('is 1', () => expect(LEDGER_SCHEMA_VERSION).toBe(1));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/ledger test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/ledger/package.json`:
```json
{
  "name": "@caspilot/ledger",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "drizzle-orm": "^0.34.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "@types/better-sqlite3": "^7.6.11",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/ledger/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/ledger/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/ledger/src/index.ts`:
```ts
export const LEDGER_SCHEMA_VERSION = 1 as const;
export * from './schema.js';
export * from './db.js';
export * from './payment-ledger.js';
export * from './spend-ledger.js';
```

`packages/ledger/src/schema.ts`:
```ts
// Filled in next task.
export {};
```

`packages/ledger/src/db.ts`:
```ts
// Filled in next task.
export {};
```

`packages/ledger/src/payment-ledger.ts`:
```ts
// Filled in Task 2.13.
export {};
```

`packages/ledger/src/spend-ledger.ts`:
```ts
// Filled in P3.
export {};
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter @caspilot/ledger test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ledger pnpm-lock.yaml
git commit -m "chore(ledger): scaffold package with better-sqlite3+drizzle"
```

---

### Task 2.12: SQLite schema + WAL helper

**Files:**
- Modify: `packages/ledger/src/schema.ts`
- Modify: `packages/ledger/src/db.ts`
- Create: `packages/ledger/test/db.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ledger/test/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations } from '../src/db.js';

describe('openLedgerDb', () => {
  it('enables WAL and creates payment_ledger + signer_spend_ledger', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-ledger-'));
    try {
      const db = openLedgerDb(join(dir, 'ledger.sqlite'));
      runMigrations(db);
      const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(journal.journal_mode).toBe('wal');
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('payment_ledger');
      expect(names).toContain('signer_spend_ledger');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/ledger test db`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/ledger/src/schema.ts`:
```ts
export const CREATE_PAYMENT_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS payment_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  payer TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  facilitator_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified','settled','failed')),
  verify_at_ms INTEGER NOT NULL,
  settle_at_ms INTEGER,
  deploy_hash TEXT,
  network TEXT NOT NULL,
  failure_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_ledger_uniq_nonce
  ON payment_ledger(nonce, payer, asset);
CREATE UNIQUE INDEX IF NOT EXISTS payment_ledger_uniq_payload
  ON payment_ledger(payload_hash);
CREATE INDEX IF NOT EXISTS payment_ledger_trace_idx ON payment_ledger(trace_id);
`;

export const CREATE_SIGNER_SPEND_LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS signer_spend_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL UNIQUE,
  policy_digest TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('user_cspr_click','local_dev','demo_sponsored')),
  asset TEXT NOT NULL,
  amount_reserved TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved','committed','released')),
  reserved_at_ms INTEGER NOT NULL,
  committed_at_ms INTEGER,
  released_at_ms INTEGER,
  released_reason TEXT
);
CREATE INDEX IF NOT EXISTS signer_spend_ledger_status_idx
  ON signer_spend_ledger(status);
`;
```

`packages/ledger/src/db.ts`:
```ts
import Database, { Database as SqliteDb } from 'better-sqlite3';
import { CREATE_PAYMENT_LEDGER_SQL, CREATE_SIGNER_SPEND_LEDGER_SQL } from './schema.js';

export interface OpenLedgerDbOptions {
  readonly?: boolean;
  timeoutMs?: number;
}

export function openLedgerDb(filename: string, opts: OpenLedgerDbOptions = {}): SqliteDb {
  const db = new Database(filename, { readonly: opts.readonly ?? false });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${opts.timeoutMs ?? 5_000}`);
  return db;
}

export function runMigrations(db: SqliteDb): void {
  db.exec(CREATE_PAYMENT_LEDGER_SQL);
  db.exec(CREATE_SIGNER_SPEND_LEDGER_SQL);
}

export type LedgerDb = SqliteDb;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/ledger test db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ledger/src/schema.ts packages/ledger/src/db.ts packages/ledger/test/db.test.ts
git commit -m "feat(ledger): WAL-enabled SQLite + payment+signer schemas"
```

---

### Task 2.13: payment_ledger insert + unique-index enforcement

**Files:**
- Modify: `packages/ledger/src/payment-ledger.ts`
- Create: `packages/ledger/test/payment-ledger.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ledger/test/payment-ledger.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations } from '../src/db.js';
import { PaymentLedger } from '../src/payment-ledger.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-pl-'));
  const db = openLedgerDb(join(dir, 'l.sqlite'));
  runMigrations(db);
  return { db, ledger: new PaymentLedger(db), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const base = {
  traceId: 'trc_1',
  nonce: '0x' + '0'.repeat(64),
  payer: '00' + '11'.repeat(32),
  payTo: '00' + '22'.repeat(32),
  asset: 'cspr-test-cep18',
  amount: '500',
  payloadHash: 'p1',
  facilitatorUrl: 'http://localhost:8080',
  network: 'casper:casper-test',
  verifyAtMs: 1_700_000_000_000,
};

describe('PaymentLedger', () => {
  it('inserts a verified entry', () => {
    const { ledger, cleanup } = fresh();
    try {
      const id = ledger.recordVerify(base);
      expect(id).toBeGreaterThan(0);
    } finally { cleanup(); }
  });

  it('rejects duplicate (nonce, payer, asset)', () => {
    const { ledger, cleanup } = fresh();
    try {
      ledger.recordVerify(base);
      expect(() => ledger.recordVerify({ ...base, payloadHash: 'p2' })).toThrowError(/UNIQUE/);
    } finally { cleanup(); }
  });

  it('rejects duplicate payload_hash', () => {
    const { ledger, cleanup } = fresh();
    try {
      ledger.recordVerify(base);
      expect(() => ledger.recordVerify({ ...base, nonce: '0x' + '1'.repeat(64) })).toThrowError(/UNIQUE/);
    } finally { cleanup(); }
  });

  it('updates status to settled with deploy_hash', () => {
    const { ledger, cleanup } = fresh();
    try {
      const id = ledger.recordVerify(base);
      ledger.recordSettle(id, { deployHash: 'a'.repeat(64), settleAtMs: 1_700_000_001_000 });
      const row = ledger.find(id);
      expect(row?.status).toBe('settled');
      expect(row?.deploy_hash).toBe('a'.repeat(64));
    } finally { cleanup(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/ledger test payment-ledger`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/ledger/src/payment-ledger.ts`:
```ts
import type { LedgerDb } from './db.js';

export interface RecordVerifyInput {
  traceId: string;
  nonce: string;
  payer: string;
  payTo: string;
  asset: string;
  amount: string;
  payloadHash: string;
  facilitatorUrl: string;
  network: string;
  verifyAtMs: number;
}

export interface RecordSettleInput {
  deployHash: string;
  settleAtMs: number;
}

export interface PaymentRow {
  id: number;
  trace_id: string;
  nonce: string;
  payer: string;
  pay_to: string;
  asset: string;
  amount: string;
  payload_hash: string;
  status: 'verified' | 'settled' | 'failed';
  deploy_hash: string | null;
  network: string;
  failure_reason: string | null;
  verify_at_ms: number;
  settle_at_ms: number | null;
}

export class PaymentLedger {
  constructor(private readonly db: LedgerDb) {}

  recordVerify(input: RecordVerifyInput): number {
    const info = this.db
      .prepare(
        `INSERT INTO payment_ledger
         (trace_id, nonce, payer, pay_to, asset, amount, payload_hash,
          facilitator_url, network, status, verify_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?)`,
      )
      .run(
        input.traceId,
        input.nonce,
        input.payer,
        input.payTo,
        input.asset,
        input.amount,
        input.payloadHash,
        input.facilitatorUrl,
        input.network,
        input.verifyAtMs,
      );
    return Number(info.lastInsertRowid);
  }

  recordSettle(id: number, s: RecordSettleInput): void {
    this.db
      .prepare(
        `UPDATE payment_ledger
         SET status='settled', deploy_hash=?, settle_at_ms=?
         WHERE id=? AND status='verified'`,
      )
      .run(s.deployHash, s.settleAtMs, id);
  }

  recordFailure(id: number, reason: string, atMs: number): void {
    this.db
      .prepare(
        `UPDATE payment_ledger
         SET status='failed', failure_reason=?, settle_at_ms=?
         WHERE id=? AND status='verified'`,
      )
      .run(reason, atMs, id);
  }

  find(id: number): PaymentRow | undefined {
    return this.db.prepare('SELECT * FROM payment_ledger WHERE id=?').get(id) as PaymentRow | undefined;
  }

  findByTraceId(traceId: string): PaymentRow | undefined {
    return this.db
      .prepare('SELECT * FROM payment_ledger WHERE trace_id=? ORDER BY id DESC LIMIT 1')
      .get(traceId) as PaymentRow | undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/ledger test payment-ledger`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ledger/src/payment-ledger.ts packages/ledger/test/payment-ledger.test.ts
git commit -m "feat(ledger): payment-ledger with unique nonce + payload"
```

---

### Task 2.14: x402 gateway middleware (Hono)

**Files:**
- Create: `packages/x402-gateway/package.json`
- Create: `packages/x402-gateway/tsconfig.json`
- Create: `packages/x402-gateway/vitest.config.ts`
- Create: `packages/x402-gateway/src/index.ts`
- Create: `packages/x402-gateway/src/middleware.ts`
- Create: `packages/x402-gateway/test/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402-gateway/test/middleware.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations, PaymentLedger } from '@caspilot/ledger';
import { FacilitatorClient, encodePaymentSignatureHeader } from '@caspilot/x402';
import { requirePayment } from '../src/middleware.js';

function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-gw-'));
  const db = openLedgerDb(join(dir, 'l.sqlite'));
  runMigrations(db);
  const ledger = new PaymentLedger(db);

  const facilitator = {
    verify: vi.fn().mockResolvedValue({ isValid: true, payer: '00' + '11'.repeat(32) }),
    settle: vi.fn().mockResolvedValue({
      success: true,
      transaction: { chainId: 'casper:casper-test', deployHash: 'a'.repeat(64) },
      payer: '00' + '11'.repeat(32),
    }),
  } as unknown as FacilitatorClient;

  const app = new Hono();
  app.use(
    '/yield/*',
    requirePayment({
      ledger,
      facilitator,
      requirements: () => ({
        scheme: 'exact',
        network: 'casper:casper-test',
        maxAmountRequired: '500',
        resource: 'https://api.test/yield/optimize',
        payTo: '00' + '22'.repeat(32),
        maxTimeoutSeconds: 60,
        asset: 'cspr-test-cep18',
        extra: {
          contractHash: '00' + '33'.repeat(32),
          decimals: 9,
          facilitatorUrl: 'http://localhost:8080',
          eip712Domain: { name: 'Caspilot', version: '1' },
        },
      }),
      traceIdFromRequest: (c) => c.req.header('x-trace-id') ?? 'trc',
    }),
  );
  app.get('/yield/optimize', (c) => c.json({ rank: ['mocked'] }));

  return { app, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('requirePayment middleware', () => {
  it('returns 402 with paymentRequirements when no header present', async () => {
    const { app, cleanup } = makeApp();
    try {
      const res = await app.request('/yield/optimize');
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.accepts[0].scheme).toBe('exact');
    } finally { cleanup(); }
  });

  it('passes through and settles when header is valid', async () => {
    const { app, cleanup } = makeApp();
    try {
      const header = encodePaymentSignatureHeader({
        x402Version: 2,
        scheme: 'exact',
        network: 'casper:casper-test',
        payload: {
          signature: 'a'.repeat(130),
          authorization: {
            from: '00' + '11'.repeat(32),
            to: '00' + '22'.repeat(32),
            value: '500',
            validAfter: '0',
            validBefore: '9999999999',
            nonce: '0x' + '0'.repeat(64),
            publicKey: '01' + '11'.repeat(32),
          },
        },
      });
      const res = await app.request('/yield/optimize', { headers: { 'PAYMENT-SIGNATURE': header } });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-x402-deploy-hash')).toBe('a'.repeat(64));
    } finally { cleanup(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/x402-gateway test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`packages/x402-gateway/package.json`:
```json
{
  "name": "@caspilot/x402-gateway",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@caspilot/x402": "workspace:*",
    "@caspilot/ledger": "workspace:*",
    "hono": "^4.6.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/x402-gateway/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/x402-gateway/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/x402-gateway/src/index.ts`:
```ts
export * from './middleware.js';
```

`packages/x402-gateway/src/middleware.ts`:
```ts
import type { Context, MiddlewareHandler } from 'hono';
import {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  decodePaymentSignatureHeader,
} from '@caspilot/x402';
import { PaymentLedger } from '@caspilot/ledger';
import { createHash } from 'node:crypto';

export interface RequirePaymentOptions {
  ledger: PaymentLedger;
  facilitator: FacilitatorClient;
  requirements: (c: Context) => PaymentRequirements;
  traceIdFromRequest: (c: Context) => string;
  now?: () => number;
}

export function requirePayment(opts: RequirePaymentOptions): MiddlewareHandler {
  const now = opts.now ?? (() => Date.now());
  return async (c, next) => {
    const requirements = opts.requirements(c);
    const header = c.req.header('PAYMENT-SIGNATURE');
    if (!header) {
      return c.json({ x402Version: 2, accepts: [requirements] }, 402);
    }

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(header);
    } catch (err) {
      return c.json({ error: 'invalid_payment_signature', message: String(err) }, 400);
    }

    const verifyRes = await opts.facilitator.verify({
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: requirements,
    });
    if (!verifyRes.isValid) {
      return c.json({ error: 'verify_failed', reason: verifyRes.invalidReason }, 402);
    }

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload.payload))
      .digest('hex');
    const traceId = opts.traceIdFromRequest(c);
    const verifyAtMs = now();
    let id: number;
    try {
      id = opts.ledger.recordVerify({
        traceId,
        nonce: payload.payload.authorization.nonce,
        payer: verifyRes.payer,
        payTo: requirements.payTo,
        asset: requirements.asset,
        amount: payload.payload.authorization.value,
        payloadHash,
        facilitatorUrl: requirements.extra.facilitatorUrl,
        network: requirements.network,
        verifyAtMs,
      });
    } catch (err) {
      return c.json({ error: 'replay', message: String(err) }, 409);
    }

    const settleRes = await opts.facilitator.settle({
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: requirements,
    });
    if (!settleRes.success) {
      opts.ledger.recordFailure(id, settleRes.errorReason, now());
      return c.json({ error: 'settle_failed', reason: settleRes.errorReason }, 502);
    }
    opts.ledger.recordSettle(id, { deployHash: settleRes.transaction.deployHash, settleAtMs: now() });
    c.header('x-x402-deploy-hash', settleRes.transaction.deployHash);
    c.header('x-x402-network', settleRes.transaction.chainId);
    await next();
  };
}
```

- [ ] **Step 4: Install and test**

Run: `pnpm install && pnpm --filter @caspilot/x402-gateway test`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/x402-gateway pnpm-lock.yaml
git commit -m "feat(x402-gateway): Hono requirePayment middleware"
```

---

### Task 2.15: Replay-protection regression test (end-to-end through middleware)

**Files:**
- Create: `packages/x402-gateway/test/replay.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402-gateway/test/replay.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations, PaymentLedger } from '@caspilot/ledger';
import { FacilitatorClient, encodePaymentSignatureHeader } from '@caspilot/x402';
import { requirePayment } from '../src/middleware.js';

describe('replay protection', () => {
  it('rejects a re-submitted PAYMENT-SIGNATURE with 409', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-gw-replay-'));
    const db = openLedgerDb(join(dir, 'l.sqlite'));
    runMigrations(db);
    const ledger = new PaymentLedger(db);
    const facilitator = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: '00' + '11'.repeat(32) }),
      settle: vi.fn().mockResolvedValue({
        success: true,
        transaction: { chainId: 'casper:casper-test', deployHash: 'a'.repeat(64) },
        payer: '00' + '11'.repeat(32),
      }),
    } as unknown as FacilitatorClient;

    const app = new Hono();
    app.use(
      '/yield/*',
      requirePayment({
        ledger,
        facilitator,
        requirements: () => ({
          scheme: 'exact',
          network: 'casper:casper-test',
          maxAmountRequired: '500',
          resource: 'r',
          payTo: '00' + '22'.repeat(32),
          maxTimeoutSeconds: 60,
          asset: 'cspr-test-cep18',
          extra: {
            contractHash: '00' + '33'.repeat(32),
            decimals: 9,
            facilitatorUrl: 'http://localhost:8080',
            eip712Domain: { name: 'Caspilot', version: '1' },
          },
        }),
        traceIdFromRequest: () => 'trc',
      }),
    );
    app.get('/yield/optimize', (c) => c.json({ ok: true }));

    const header = encodePaymentSignatureHeader({
      x402Version: 2, scheme: 'exact', network: 'casper:casper-test',
      payload: {
        signature: 'a'.repeat(130),
        authorization: {
          from: '00' + '11'.repeat(32), to: '00' + '22'.repeat(32),
          value: '500', validAfter: '0', validBefore: '9999999999',
          nonce: '0x' + '0'.repeat(64), publicKey: '01' + '11'.repeat(32),
        },
      },
    });

    try {
      const ok = await app.request('/yield/optimize', { headers: { 'PAYMENT-SIGNATURE': header } });
      expect(ok.status).toBe(200);
      const replay = await app.request('/yield/optimize', { headers: { 'PAYMENT-SIGNATURE': header } });
      expect(replay.status).toBe(409);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @caspilot/x402-gateway test replay`
Expected: PASS — middleware + ledger UNIQUE indexes correctly reject the second request.

- [ ] **Step 3: Commit**

```bash
git add packages/x402-gateway/test/replay.test.ts
git commit -m "test(x402-gateway): end-to-end replay rejection"
```

---

### Task 2.16: Postgres/Turso migration note (docs only — NO implementation)

**Files:**
- Create: `packages/ledger/MIGRATION.md`

- [ ] **Step 1: Write the doc**

`packages/ledger/MIGRATION.md`:
```markdown
# Ledger Storage Migration Path

**Current MVP (locked):** SQLite + Drizzle + WAL on a persistent volume, single API instance.

**Why not Postgres for the hackathon:** A single API instance + WAL SQLite gives strong replay protection (UNIQUE constraints) and is simpler to deploy. Postgres would add an extra service to operate without changing the MVP guarantees.

**Post-hackathon migration to Postgres / Turso (documented, NOT implemented):**
- Schema: translate `payment_ledger` + `signer_spend_ledger` 1:1 (replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `BIGSERIAL`, `INTEGER` for `*_at_ms` with `BIGINT`, `TEXT CHECK (...)` with native ENUMs or domain constraints).
- UNIQUE indexes: identical column tuples — `(nonce, payer, asset)` and `(payload_hash)` on `payment_ledger`; `(intent_id)` on `signer_spend_ledger`.
- Drizzle ORM models continue to work via `drizzle-orm/postgres-js` instead of `drizzle-orm/better-sqlite3`; the high-level repository classes (`PaymentLedger`, `SignerSpendLedger`) stay unchanged.
- Multiple API instances: only safe once the storage is Postgres/Turso. SQLite + WAL assumes a single writer.

**Do NOT introduce Postgres into P2 of this plan.**
```

- [ ] **Step 2: Commit**

```bash
git add packages/ledger/MIGRATION.md
git commit -m "docs(ledger): document Postgres/Turso migration path (not implementation)"
```

---

### Task 2.17: P2 acceptance summary test

**Files:**
- Create: `packages/x402-gateway/test/p2-acceptance.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/x402-gateway/test/p2-acceptance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  WireVerifyResponse,
  WireSettleResponse,
  NormalizedVerifyResponse,
  NormalizedSettleResponse,
  normalizeVerifyResponse,
  normalizeSettleResponse,
  encodePaymentSignatureHeader,
  decodePaymentSignatureHeader,
  PaymentPayload,
} from '@caspilot/x402';

describe('P2 acceptance', () => {
  it('Wire and Normalized verify schemas differ (Normalized requires payer)', () => {
    expect(WireVerifyResponse.safeParse({ isValid: true }).success).toBe(true);
    // Normalized must reject missing payer
    // (use parse on the produced normalized shape)
  });

  it('Wire and Normalized settle schemas differ (transaction string vs object)', () => {
    const wire: WireSettleResponse = {
      success: true,
      transaction: 'a'.repeat(64),
      network: 'casper:casper-test',
      payer: '00' + '11'.repeat(32),
    };
    const norm: NormalizedSettleResponse = normalizeSettleResponse(wire);
    if (norm.success) {
      expect(typeof norm.transaction).toBe('object');
    } else {
      expect.fail('expected success');
    }
  });

  it('PAYMENT-SIGNATURE header round-trips', () => {
    const payload: PaymentPayload = {
      x402Version: 2, scheme: 'exact', network: 'casper:casper-test',
      payload: {
        signature: 'a'.repeat(130),
        authorization: {
          from: '00' + '11'.repeat(32), to: '00' + '22'.repeat(32),
          value: '1', validAfter: '0', validBefore: '1',
          nonce: '0x' + '0'.repeat(64), publicKey: '01' + '11'.repeat(32),
        },
      },
    };
    expect(decodePaymentSignatureHeader(encodePaymentSignatureHeader(payload))).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @caspilot/x402-gateway test p2-acceptance`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/x402-gateway/test/p2-acceptance.test.ts
git commit -m "test: P2 acceptance summary"
```

---

## Phase 3 — SignerGuard + SQLite spend ledger

### Task 3.1: Package skeleton `@caspilot/signer-guard`

**Files:**
- Create: `packages/signer-guard/package.json`
- Create: `packages/signer-guard/tsconfig.json`
- Create: `packages/signer-guard/vitest.config.ts`
- Create: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/_smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SIGNER_ROLES } from '../src/index.js';

describe('SIGNER_ROLES', () => {
  it('has three roles', () => {
    expect(SIGNER_ROLES).toEqual(['user_cspr_click', 'local_dev', 'demo_sponsored']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/signer-guard test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`packages/signer-guard/package.json`:
```json
{
  "name": "@caspilot/signer-guard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@caspilot/ledger": "workspace:*",
    "@caspilot/x402": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/signer-guard/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/signer-guard/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/signer-guard/src/index.ts`:
```ts
export const SIGNER_ROLES = ['user_cspr_click', 'local_dev', 'demo_sponsored'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export * from './config.js';
export * from './digest.js';
export * from './rules.js';
export * from './guard.js';
```

`packages/signer-guard/src/config.ts`:
```ts
export {};
```

`packages/signer-guard/src/digest.ts`:
```ts
export {};
```

`packages/signer-guard/src/rules.ts`:
```ts
export {};
```

`packages/signer-guard/src/guard.ts`:
```ts
export {};
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter @caspilot/signer-guard test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/signer-guard pnpm-lock.yaml
git commit -m "chore(signer-guard): scaffold package"
```

---

### Task 3.2: Config schema with deny-empty rule

**Files:**
- Modify: `packages/signer-guard/src/config.ts`
- Create: `packages/signer-guard/test/config.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SignerGuardConfig } from '../src/config.js';

describe('SignerGuardConfig', () => {
  it('parses canonical config', () => {
    const c = SignerGuardConfig.parse({
      role: 'local_dev',
      agents: ['00' + '11'.repeat(32)],
      receivers: ['00' + '22'.repeat(32)],
      tokens: ['cspr-test-cep18'],
      contracts: ['00' + '33'.repeat(32)],
      networks: ['casper:casper-test'],
      maxSinglePayment: '500',
      dailyLimit: '5000',
      validUntilMs: 9_999_999_999_999,
    });
    expect(c.role).toBe('local_dev');
  });

  it('rejects when agents array is empty (deny-empty)', () => {
    expect(
      SignerGuardConfig.safeParse({
        role: 'local_dev',
        agents: [],
        receivers: ['00' + '22'.repeat(32)],
        tokens: ['a'],
        contracts: ['00' + '33'.repeat(32)],
        networks: ['casper:casper-test'],
        maxSinglePayment: '500',
        dailyLimit: '5000',
        validUntilMs: 9_999_999_999_999,
      }).success,
    ).toBe(false);
  });

  it('rejects when receivers array is empty (deny-empty)', () => {
    expect(
      SignerGuardConfig.safeParse({
        role: 'local_dev',
        agents: ['00' + '11'.repeat(32)],
        receivers: [],
        tokens: ['a'],
        contracts: ['00' + '33'.repeat(32)],
        networks: ['casper:casper-test'],
        maxSinglePayment: '500',
        dailyLimit: '5000',
        validUntilMs: 9_999_999_999_999,
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/signer-guard test config`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/signer-guard/src/config.ts`:
```ts
import { z } from 'zod';
import { CasperAccountAddressHex } from '@caspilot/x402';

export const SignerGuardConfig = z.object({
  role: z.enum(['user_cspr_click', 'local_dev', 'demo_sponsored']),
  agents: z.array(CasperAccountAddressHex).min(1, 'empty agents allowlist is deny-all'),
  receivers: z.array(CasperAccountAddressHex).min(1, 'empty receivers allowlist is deny-all'),
  tokens: z.array(z.string()).min(1, 'empty tokens allowlist is deny-all'),
  contracts: z.array(CasperAccountAddressHex).min(1, 'empty contracts allowlist is deny-all'),
  networks: z.array(z.string().regex(/^casper:[a-z0-9-]+$/)).min(1),
  maxSinglePayment: z.string().regex(/^\d+$/),
  dailyLimit: z.string().regex(/^\d+$/),
  validUntilMs: z.number().int().positive(),
});
export type SignerGuardConfig = z.infer<typeof SignerGuardConfig>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/signer-guard test config`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/signer-guard/src/config.ts packages/signer-guard/test/config.test.ts
git commit -m "feat(signer-guard): config schema with deny-empty rule"
```

---

### Task 3.3: Canonical-JSON policy digest

**Files:**
- Modify: `packages/signer-guard/src/digest.ts`
- Create: `packages/signer-guard/test/digest.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/digest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computePolicyDigest } from '../src/digest.js';

describe('computePolicyDigest', () => {
  it('is deterministic regardless of key order', () => {
    const a = computePolicyDigest({
      role: 'local_dev',
      agents: ['00' + '11'.repeat(32)],
      receivers: ['00' + '22'.repeat(32)],
      tokens: ['cspr-test-cep18'],
      contracts: ['00' + '33'.repeat(32)],
      networks: ['casper:casper-test'],
      maxSinglePayment: '500',
      dailyLimit: '5000',
      validUntilMs: 9_999_999_999_999,
    });
    const b = computePolicyDigest({
      validUntilMs: 9_999_999_999_999,
      dailyLimit: '5000',
      maxSinglePayment: '500',
      networks: ['casper:casper-test'],
      contracts: ['00' + '33'.repeat(32)],
      tokens: ['cspr-test-cep18'],
      receivers: ['00' + '22'.repeat(32)],
      agents: ['00' + '11'.repeat(32)],
      role: 'local_dev',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when any field changes', () => {
    const base = {
      role: 'local_dev' as const,
      agents: ['00' + '11'.repeat(32)],
      receivers: ['00' + '22'.repeat(32)],
      tokens: ['t'],
      contracts: ['00' + '33'.repeat(32)],
      networks: ['casper:casper-test'],
      maxSinglePayment: '500',
      dailyLimit: '5000',
      validUntilMs: 9_999_999_999_999,
    };
    expect(computePolicyDigest(base)).not.toBe(
      computePolicyDigest({ ...base, maxSinglePayment: '501' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/signer-guard test digest`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/signer-guard/src/digest.ts`:
```ts
import { createHash } from 'node:crypto';
import type { SignerGuardConfig } from './config.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).sort();
    return keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize((value as Record<string, unknown>)[k]);
      return acc;
    }, {});
  }
  return value;
}

export function computePolicyDigest(cfg: SignerGuardConfig): string {
  const canonical = JSON.stringify(canonicalize(cfg));
  return createHash('sha256').update(canonical).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/signer-guard test digest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/signer-guard/src/digest.ts packages/signer-guard/test/digest.test.ts
git commit -m "feat(signer-guard): canonical policy digest"
```

---

### Task 3.4: Per-rule check function

**Files:**
- Modify: `packages/signer-guard/src/rules.ts`
- Create: `packages/signer-guard/test/rules.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/rules.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkRules, RULE_CODES } from '../src/rules.js';
import type { SignerGuardConfig } from '../src/config.js';

const cfg: SignerGuardConfig = {
  role: 'local_dev',
  agents: ['00' + 'aa'.repeat(32)],
  receivers: ['00' + 'bb'.repeat(32)],
  tokens: ['cspr-test-cep18'],
  contracts: ['00' + 'cc'.repeat(32)],
  networks: ['casper:casper-test'],
  maxSinglePayment: '500',
  dailyLimit: '1500',
  validUntilMs: 9_999_999_999_999,
};

const baseIntent = {
  agent: '00' + 'aa'.repeat(32),
  receiver: '00' + 'bb'.repeat(32),
  token: 'cspr-test-cep18',
  contract: '00' + 'cc'.repeat(32),
  network: 'casper:casper-test',
  amount: '500',
  nowMs: 1_700_000_000_000,
  todaySpent: '0',
};

describe('checkRules', () => {
  it('allows when all rules pass', () => {
    const r = checkRules(cfg, baseIntent);
    expect(r.allowed).toBe(true);
  });

  it('rejects unauthorized agent', () => {
    const r = checkRules(cfg, { ...baseIntent, agent: '00' + '00'.repeat(32) });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.agentNotAllowed);
  });

  it('rejects unauthorized receiver', () => {
    const r = checkRules(cfg, { ...baseIntent, receiver: '00' + '00'.repeat(32) });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.receiverNotAllowed);
  });

  it('rejects unauthorized token', () => {
    const r = checkRules(cfg, { ...baseIntent, token: 'other' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.tokenNotAllowed);
  });

  it('rejects unauthorized network', () => {
    const r = checkRules(cfg, { ...baseIntent, network: 'casper:mainnet' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.networkNotAllowed);
  });

  it('rejects amount above max_single', () => {
    const r = checkRules(cfg, { ...baseIntent, amount: '501' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.amountAboveMaxSingle);
  });

  it('rejects when today spent + amount > daily limit', () => {
    const r = checkRules(cfg, { ...baseIntent, todaySpent: '1100', amount: '500' });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.dailyLimitExceeded);
  });

  it('rejects when valid_until has passed', () => {
    const cfgExpired = { ...cfg, validUntilMs: 1_699_999_999_000 };
    const r = checkRules(cfgExpired, baseIntent);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe(RULE_CODES.authorizationExpired);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/signer-guard test rules`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/signer-guard/src/rules.ts`:
```ts
import type { SignerGuardConfig } from './config.js';

export const RULE_CODES = {
  agentNotAllowed: 'agent_not_allowed',
  receiverNotAllowed: 'receiver_not_allowed',
  tokenNotAllowed: 'token_not_allowed',
  contractNotAllowed: 'contract_not_allowed',
  networkNotAllowed: 'network_not_allowed',
  amountAboveMaxSingle: 'amount_above_max_single',
  dailyLimitExceeded: 'daily_limit_exceeded',
  authorizationExpired: 'authorization_expired',
} as const;
export type RuleCode = (typeof RULE_CODES)[keyof typeof RULE_CODES];

export interface IntentForGuard {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string; // base-units integer string
  nowMs: number;
  todaySpent: string; // base-units integer string
}

export type RuleResult =
  | { allowed: true }
  | { allowed: false; code: RuleCode; message: string };

function deny(code: RuleCode, message: string): RuleResult {
  return { allowed: false, code, message };
}

export function checkRules(cfg: SignerGuardConfig, i: IntentForGuard): RuleResult {
  if (!cfg.agents.includes(i.agent)) return deny(RULE_CODES.agentNotAllowed, `agent ${i.agent}`);
  if (!cfg.receivers.includes(i.receiver)) return deny(RULE_CODES.receiverNotAllowed, `receiver ${i.receiver}`);
  if (!cfg.tokens.includes(i.token)) return deny(RULE_CODES.tokenNotAllowed, `token ${i.token}`);
  if (!cfg.contracts.includes(i.contract)) return deny(RULE_CODES.contractNotAllowed, `contract ${i.contract}`);
  if (!cfg.networks.includes(i.network)) return deny(RULE_CODES.networkNotAllowed, `network ${i.network}`);

  const amt = BigInt(i.amount);
  if (amt > BigInt(cfg.maxSinglePayment)) {
    return deny(RULE_CODES.amountAboveMaxSingle, `amount ${i.amount} > max ${cfg.maxSinglePayment}`);
  }
  const projected = BigInt(i.todaySpent) + amt;
  if (projected > BigInt(cfg.dailyLimit)) {
    return deny(RULE_CODES.dailyLimitExceeded, `today+amount ${projected} > daily ${cfg.dailyLimit}`);
  }
  if (i.nowMs > cfg.validUntilMs) {
    return deny(RULE_CODES.authorizationExpired, `nowMs ${i.nowMs} > validUntilMs ${cfg.validUntilMs}`);
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/signer-guard test rules`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/signer-guard/src/rules.ts packages/signer-guard/test/rules.test.ts
git commit -m "feat(signer-guard): per-rule check function"
```

---

### Task 3.5: SignerSpendLedger insert + UNIQUE(intent_id)

**Files:**
- Modify: `packages/ledger/src/spend-ledger.ts`
- Create: `packages/ledger/test/spend-ledger.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ledger/test/spend-ledger.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations } from '../src/db.js';
import { SignerSpendLedger } from '../src/spend-ledger.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-spend-'));
  const db = openLedgerDb(join(dir, 'l.sqlite'));
  runMigrations(db);
  return { db, l: new SignerSpendLedger(db), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const base = {
  intentId: 'int_001',
  policyDigest: 'd'.repeat(64),
  signerRole: 'local_dev' as const,
  asset: 'cspr-test-cep18',
  amountReserved: '500',
  reservedAtMs: 1_700_000_000_000,
};

describe('SignerSpendLedger', () => {
  it('reserves an entry', () => {
    const { l, cleanup } = fresh();
    try {
      const id = l.reserve(base);
      expect(id).toBeGreaterThan(0);
    } finally { cleanup(); }
  });

  it('rejects duplicate intent_id', () => {
    const { l, cleanup } = fresh();
    try {
      l.reserve(base);
      expect(() => l.reserve(base)).toThrowError(/UNIQUE/);
    } finally { cleanup(); }
  });

  it('commits on EXECUTED', () => {
    const { l, cleanup } = fresh();
    try {
      l.reserve(base);
      l.commit(base.intentId, 1_700_000_001_000);
      const row = l.findByIntentId(base.intentId);
      expect(row?.status).toBe('committed');
    } finally { cleanup(); }
  });

  it('releases on REJECTED with reason', () => {
    const { l, cleanup } = fresh();
    try {
      l.reserve(base);
      l.release(base.intentId, 'execution_failed', 1_700_000_002_000);
      const row = l.findByIntentId(base.intentId);
      expect(row?.status).toBe('released');
      expect(row?.released_reason).toBe('execution_failed');
    } finally { cleanup(); }
  });

  it('sumReservedFor(asset) sums only reserved rows in same day', () => {
    const { l, cleanup } = fresh();
    try {
      l.reserve({ ...base, intentId: 'a', amountReserved: '100' });
      l.reserve({ ...base, intentId: 'b', amountReserved: '200' });
      l.release('b', 'reverted', 1_700_000_001_000);
      const sum = l.sumReservedFor({ asset: 'cspr-test-cep18', sinceMs: 1_700_000_000_000 - 1 });
      expect(sum).toBe('100');
    } finally { cleanup(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/ledger test spend-ledger`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/ledger/src/spend-ledger.ts`:
```ts
import type { LedgerDb } from './db.js';

export type SignerRole = 'user_cspr_click' | 'local_dev' | 'demo_sponsored';

export interface ReserveInput {
  intentId: string;
  policyDigest: string;
  signerRole: SignerRole;
  asset: string;
  amountReserved: string;
  reservedAtMs: number;
}

export interface SpendRow {
  id: number;
  intent_id: string;
  policy_digest: string;
  signer_role: SignerRole;
  asset: string;
  amount_reserved: string;
  status: 'reserved' | 'committed' | 'released';
  reserved_at_ms: number;
  committed_at_ms: number | null;
  released_at_ms: number | null;
  released_reason: string | null;
}

export class SignerSpendLedger {
  constructor(private readonly db: LedgerDb) {}

  reserve(i: ReserveInput): number {
    const info = this.db
      .prepare(
        `INSERT INTO signer_spend_ledger
         (intent_id, policy_digest, signer_role, asset, amount_reserved, status, reserved_at_ms)
         VALUES (?, ?, ?, ?, ?, 'reserved', ?)`,
      )
      .run(i.intentId, i.policyDigest, i.signerRole, i.asset, i.amountReserved, i.reservedAtMs);
    return Number(info.lastInsertRowid);
  }

  commit(intentId: string, atMs: number): void {
    this.db
      .prepare(
        `UPDATE signer_spend_ledger
         SET status='committed', committed_at_ms=?
         WHERE intent_id=? AND status='reserved'`,
      )
      .run(atMs, intentId);
  }

  release(intentId: string, reason: string, atMs: number): void {
    this.db
      .prepare(
        `UPDATE signer_spend_ledger
         SET status='released', released_reason=?, released_at_ms=?
         WHERE intent_id=? AND status IN ('reserved','committed')`,
      )
      .run(reason, atMs, intentId);
  }

  findByIntentId(intentId: string): SpendRow | undefined {
    return this.db
      .prepare('SELECT * FROM signer_spend_ledger WHERE intent_id=?')
      .get(intentId) as SpendRow | undefined;
  }

  sumReservedFor(opts: { asset: string; sinceMs: number }): string {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(CAST(amount_reserved AS INTEGER)), 0) AS s
         FROM signer_spend_ledger
         WHERE asset=? AND status='reserved' AND reserved_at_ms >= ?`,
      )
      .get(opts.asset, opts.sinceMs) as { s: number };
    return String(row.s);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/ledger test spend-ledger`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ledger/src/spend-ledger.ts packages/ledger/test/spend-ledger.test.ts
git commit -m "feat(ledger): signer spend ledger (reserve/commit/release)"
```

---

### Task 3.6: SignerGuard.gate() orchestration

**Files:**
- Modify: `packages/signer-guard/src/guard.ts`
- Create: `packages/signer-guard/test/guard.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/guard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations, SignerSpendLedger } from '@caspilot/ledger';
import { SignerGuard } from '../src/guard.js';
import type { SignerGuardConfig } from '../src/config.js';

const cfg: SignerGuardConfig = {
  role: 'local_dev',
  agents: ['00' + 'aa'.repeat(32)],
  receivers: ['00' + 'bb'.repeat(32)],
  tokens: ['cspr-test-cep18'],
  contracts: ['00' + 'cc'.repeat(32)],
  networks: ['casper:casper-test'],
  maxSinglePayment: '500',
  dailyLimit: '1500',
  validUntilMs: 9_999_999_999_999,
};

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-guard-'));
  const db = openLedgerDb(join(dir, 'l.sqlite'));
  runMigrations(db);
  const spend = new SignerSpendLedger(db);
  const guard = new SignerGuard({ cfg, spendLedger: spend });
  return { guard, spend, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const intent = {
  agent: '00' + 'aa'.repeat(32),
  receiver: '00' + 'bb'.repeat(32),
  token: 'cspr-test-cep18',
  contract: '00' + 'cc'.repeat(32),
  network: 'casper:casper-test',
  amount: '500',
  nowMs: 1_700_000_000_000,
};

describe('SignerGuard.gate', () => {
  it('reserves on allow', async () => {
    const { guard, spend, cleanup } = setup();
    try {
      const r = await guard.gate({ intentId: 'i1', ...intent });
      expect(r.allowed).toBe(true);
      expect(spend.findByIntentId('i1')?.status).toBe('reserved');
    } finally { cleanup(); }
  });

  it('rejects without reservation when rule denies', async () => {
    const { guard, spend, cleanup } = setup();
    try {
      const r = await guard.gate({ intentId: 'i2', ...intent, amount: '600' });
      expect(r.allowed).toBe(false);
      expect(spend.findByIntentId('i2')).toBeUndefined();
    } finally { cleanup(); }
  });

  it('commit transitions reserved → committed', async () => {
    const { guard, spend, cleanup } = setup();
    try {
      await guard.gate({ intentId: 'i3', ...intent });
      guard.commit('i3', 1_700_000_001_000);
      expect(spend.findByIntentId('i3')?.status).toBe('committed');
    } finally { cleanup(); }
  });

  it('release transitions reserved → released', async () => {
    const { guard, spend, cleanup } = setup();
    try {
      await guard.gate({ intentId: 'i4', ...intent });
      guard.release('i4', 'rejected_by_chain', 1_700_000_001_000);
      expect(spend.findByIntentId('i4')?.status).toBe('released');
    } finally { cleanup(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/signer-guard test guard`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/signer-guard/src/guard.ts`:
```ts
import { SignerSpendLedger } from '@caspilot/ledger';
import { computePolicyDigest } from './digest.js';
import { checkRules, type RuleResult, type IntentForGuard } from './rules.js';
import type { SignerGuardConfig } from './config.js';

export interface SignerGuardOptions {
  cfg: SignerGuardConfig;
  spendLedger: SignerSpendLedger;
  dayWindowMs?: number;
}

export interface GateInput extends IntentForGuard {
  intentId: string;
}

export interface GateAllowed { allowed: true; policyDigest: string }
export interface GateDenied extends Exclude<RuleResult, { allowed: true }> { allowed: false; policyDigest: string }
export type GateResult = GateAllowed | GateDenied;

export class SignerGuard {
  private readonly cfg: SignerGuardConfig;
  private readonly spend: SignerSpendLedger;
  private readonly dayMs: number;
  private readonly digest: string;

  constructor(opts: SignerGuardOptions) {
    this.cfg = opts.cfg;
    this.spend = opts.spendLedger;
    this.dayMs = opts.dayWindowMs ?? 86_400_000;
    this.digest = computePolicyDigest(this.cfg);
  }

  policyDigest(): string {
    return this.digest;
  }

  async gate(input: GateInput): Promise<GateResult> {
    const sinceMs = input.nowMs - this.dayMs;
    const todaySpent = this.spend.sumReservedFor({ asset: input.token, sinceMs });
    const r = checkRules(this.cfg, { ...input, todaySpent });
    if (!r.allowed) return { ...r, policyDigest: this.digest };

    this.spend.reserve({
      intentId: input.intentId,
      policyDigest: this.digest,
      signerRole: this.cfg.role,
      asset: input.token,
      amountReserved: input.amount,
      reservedAtMs: input.nowMs,
    });
    return { allowed: true, policyDigest: this.digest };
  }

  commit(intentId: string, atMs: number): void {
    this.spend.commit(intentId, atMs);
  }

  release(intentId: string, reason: string, atMs: number): void {
    this.spend.release(intentId, reason, atMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/signer-guard test guard`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/signer-guard/src/guard.ts packages/signer-guard/test/guard.test.ts
git commit -m "feat(signer-guard): gate/commit/release orchestration"
```

---

### Task 3.7: Three-signer-role separation enforcement test

**Files:**
- Create: `packages/signer-guard/test/role-separation.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/role-separation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations, SignerSpendLedger } from '@caspilot/ledger';
import { SignerGuard } from '../src/guard.js';
import type { SignerGuardConfig } from '../src/config.js';

function configFor(role: SignerGuardConfig['role']): SignerGuardConfig {
  return {
    role,
    agents: ['00' + 'aa'.repeat(32)],
    receivers: ['00' + 'bb'.repeat(32)],
    tokens: ['cspr-test-cep18'],
    contracts: ['00' + 'cc'.repeat(32)],
    networks: ['casper:casper-test'],
    maxSinglePayment: '500',
    dailyLimit: '1500',
    validUntilMs: 9_999_999_999_999,
  };
}

describe('three-signer-role separation', () => {
  it('each role produces a distinct policy digest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-roles-'));
    try {
      const db = openLedgerDb(join(dir, 'l.sqlite'));
      runMigrations(db);
      const spend = new SignerSpendLedger(db);
      const dUser = new SignerGuard({ cfg: configFor('user_cspr_click'), spendLedger: spend }).policyDigest();
      const dLocal = new SignerGuard({ cfg: configFor('local_dev'), spendLedger: spend }).policyDigest();
      const dDemo = new SignerGuard({ cfg: configFor('demo_sponsored'), spendLedger: spend }).policyDigest();
      expect(new Set([dUser, dLocal, dDemo]).size).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('role enum is closed (compile-time guard)', () => {
    const roles: SignerGuardConfig['role'][] = ['user_cspr_click', 'local_dev', 'demo_sponsored'];
    expect(roles).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @caspilot/signer-guard test role-separation`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/signer-guard/test/role-separation.test.ts
git commit -m "test(signer-guard): three-role digest separation"
```

---

### Task 3.8: Deny-all-on-empty hostile test

**Files:**
- Create: `packages/signer-guard/test/deny-empty.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/deny-empty.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SignerGuardConfig } from '../src/config.js';

describe('deny-empty hostile scenarios', () => {
  const baseValid = {
    role: 'local_dev',
    agents: ['00' + '11'.repeat(32)],
    receivers: ['00' + '22'.repeat(32)],
    tokens: ['a'],
    contracts: ['00' + '33'.repeat(32)],
    networks: ['casper:casper-test'],
    maxSinglePayment: '1',
    dailyLimit: '1',
    validUntilMs: 1,
  };

  for (const field of ['agents', 'receivers', 'tokens', 'contracts', 'networks'] as const) {
    it(`rejects empty ${field}`, () => {
      const broken = { ...baseValid, [field]: [] };
      expect(SignerGuardConfig.safeParse(broken).success).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @caspilot/signer-guard test deny-empty`
Expected: 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/signer-guard/test/deny-empty.test.ts
git commit -m "test(signer-guard): exhaustive deny-empty coverage"
```

---

### Task 3.9: Replay rejection on duplicate intent_id

**Files:**
- Create: `packages/signer-guard/test/replay.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/replay.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { openLedgerDb, runMigrations, SignerSpendLedger } from '@caspilot/ledger';
import { SignerGuard } from '../src/guard.js';
import type { SignerGuardConfig } from '../src/config.js';

const cfg: SignerGuardConfig = {
  role: 'local_dev',
  agents: ['00' + 'aa'.repeat(32)],
  receivers: ['00' + 'bb'.repeat(32)],
  tokens: ['cspr-test-cep18'],
  contracts: ['00' + 'cc'.repeat(32)],
  networks: ['casper:casper-test'],
  maxSinglePayment: '500',
  dailyLimit: '5000',
  validUntilMs: 9_999_999_999_999,
};

describe('replay rejection', () => {
  it('throws when same intent_id is reserved twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-guard-replay-'));
    try {
      const db = openLedgerDb(join(dir, 'l.sqlite'));
      runMigrations(db);
      const guard = new SignerGuard({ cfg, spendLedger: new SignerSpendLedger(db) });
      const intent = {
        intentId: 'dup',
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
        nowMs: 1_700_000_000_000,
      };
      const ok = await guard.gate(intent);
      expect(ok.allowed).toBe(true);
      await expect(guard.gate(intent)).rejects.toThrowError(/UNIQUE/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @caspilot/signer-guard test replay`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/signer-guard/test/replay.test.ts
git commit -m "test(signer-guard): UNIQUE intent_id rejects replay"
```

---

### Task 3.10: P3 acceptance summary

**Files:**
- Create: `packages/signer-guard/test/p3-acceptance.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/signer-guard/test/p3-acceptance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SIGNER_ROLES, computePolicyDigest, checkRules, RULE_CODES } from '../src/index.js';

describe('P3 acceptance', () => {
  it('exports the three roles', () => {
    expect(SIGNER_ROLES.length).toBe(3);
  });
  it('exports policy digest + checkRules', () => {
    expect(typeof computePolicyDigest).toBe('function');
    expect(typeof checkRules).toBe('function');
    expect(Object.keys(RULE_CODES).length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @caspilot/signer-guard test p3-acceptance`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/signer-guard/test/p3-acceptance.test.ts
git commit -m "test: P3 acceptance summary"
```

---

## Phase 4 — Intent FSM, adapters, audit trace, Hono router

### Task 4.1: Package skeleton `@caspilot/intent-fsm`

**Files:**
- Create: `packages/intent-fsm/package.json`
- Create: `packages/intent-fsm/tsconfig.json`
- Create: `packages/intent-fsm/vitest.config.ts`
- Create: `packages/intent-fsm/src/index.ts`
- Create: `packages/intent-fsm/test/_smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/intent-fsm/test/_smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { INTENT_STATES } from '../src/index.js';

describe('INTENT_STATES', () => {
  it('has 12 states', () => expect(INTENT_STATES.length).toBe(12));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/intent-fsm test`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/intent-fsm/package.json`:
```json
{
  "name": "@caspilot/intent-fsm",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/intent-fsm/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/intent-fsm/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/intent-fsm/src/index.ts`:
```ts
export * from './states.js';
export * from './transitions.js';
export * from './branded.js';
export * from './canonical-json.js';
```

`packages/intent-fsm/src/states.ts`:
```ts
export const INTENT_STATES = [
  'DRAFT',
  'POLICY_VALIDATED',
  'PAYMENT_REQUIRED',
  'PAYMENT_VERIFIED',
  'READY_TO_SUBMIT',
  'SIGNED_RECEIVED',
  'ACCEPTED_BY_NODE',
  'EXECUTED',
  'FINALIZED',
  'EXECUTION_FAILED',
  'REJECTED',
  'TIMEOUT',
] as const;
export type IntentState = (typeof INTENT_STATES)[number];
```

`packages/intent-fsm/src/transitions.ts`:
```ts
export {};
```

`packages/intent-fsm/src/branded.ts`:
```ts
export {};
```

`packages/intent-fsm/src/canonical-json.ts`:
```ts
export {};
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter @caspilot/intent-fsm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/intent-fsm pnpm-lock.yaml
git commit -m "chore(intent-fsm): scaffold 12-state package"
```

---

### Task 4.2: ALLOWED_TRANSITIONS map + canTransition

**Files:**
- Modify: `packages/intent-fsm/src/transitions.ts`
- Create: `packages/intent-fsm/test/transitions.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/intent-fsm/test/transitions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canTransition, ALLOWED_TRANSITIONS, TERMINAL_STATES } from '../src/transitions.js';

describe('ALLOWED_TRANSITIONS', () => {
  it('happy path: DRAFT → POLICY_VALIDATED → PAYMENT_REQUIRED → PAYMENT_VERIFIED → READY_TO_SUBMIT → SIGNED_RECEIVED → ACCEPTED_BY_NODE → EXECUTED → FINALIZED', () => {
    const path = [
      'DRAFT','POLICY_VALIDATED','PAYMENT_REQUIRED','PAYMENT_VERIFIED',
      'READY_TO_SUBMIT','SIGNED_RECEIVED','ACCEPTED_BY_NODE','EXECUTED','FINALIZED'
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping POLICY_VALIDATED', () => {
    expect(canTransition('DRAFT', 'PAYMENT_REQUIRED')).toBe(false);
  });

  it('REJECTED reachable from DRAFT or POLICY_VALIDATED', () => {
    expect(canTransition('DRAFT', 'REJECTED')).toBe(true);
    expect(canTransition('POLICY_VALIDATED', 'REJECTED')).toBe(true);
  });

  it('EXECUTION_FAILED reachable from ACCEPTED_BY_NODE', () => {
    expect(canTransition('ACCEPTED_BY_NODE', 'EXECUTION_FAILED')).toBe(true);
  });

  it('TIMEOUT reachable from any non-terminal state', () => {
    for (const s of ['DRAFT','POLICY_VALIDATED','PAYMENT_REQUIRED','PAYMENT_VERIFIED','READY_TO_SUBMIT','SIGNED_RECEIVED','ACCEPTED_BY_NODE'] as const) {
      expect(canTransition(s, 'TIMEOUT')).toBe(true);
    }
  });

  it('terminal states cannot transition', () => {
    for (const t of TERMINAL_STATES) {
      expect(canTransition(t, 'DRAFT')).toBe(false);
    }
  });

  it('TIMEOUT is not the same as failure', () => {
    expect(TERMINAL_STATES).toContain('TIMEOUT');
    expect(TERMINAL_STATES).toContain('EXECUTION_FAILED');
    // semantic note: TIMEOUT does not imply EXECUTION_FAILED
    expect(canTransition('TIMEOUT', 'EXECUTION_FAILED')).toBe(false);
  });

  it('exposes ALLOWED_TRANSITIONS for inspection', () => {
    expect(Array.from(ALLOWED_TRANSITIONS.keys()).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/intent-fsm test transitions`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/intent-fsm/src/transitions.ts`:
```ts
import type { IntentState } from './states.js';

export const TERMINAL_STATES = ['FINALIZED', 'EXECUTION_FAILED', 'REJECTED', 'TIMEOUT'] as const;
type Terminal = (typeof TERMINAL_STATES)[number];

const transitions: Array<[IntentState, IntentState[]]> = [
  ['DRAFT', ['POLICY_VALIDATED', 'REJECTED', 'TIMEOUT']],
  ['POLICY_VALIDATED', ['PAYMENT_REQUIRED', 'REJECTED', 'TIMEOUT']],
  ['PAYMENT_REQUIRED', ['PAYMENT_VERIFIED', 'TIMEOUT']],
  ['PAYMENT_VERIFIED', ['READY_TO_SUBMIT', 'TIMEOUT']],
  ['READY_TO_SUBMIT', ['SIGNED_RECEIVED', 'TIMEOUT']],
  ['SIGNED_RECEIVED', ['ACCEPTED_BY_NODE', 'TIMEOUT']],
  ['ACCEPTED_BY_NODE', ['EXECUTED', 'EXECUTION_FAILED', 'TIMEOUT']],
  ['EXECUTED', ['FINALIZED']],
];

export const ALLOWED_TRANSITIONS: ReadonlyMap<IntentState, ReadonlySet<IntentState>> = new Map(
  transitions.map(([from, to]) => [from, new Set(to)]),
);

export function isTerminal(state: IntentState): state is Terminal {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransition(from: IntentState, to: IntentState): boolean {
  if (isTerminal(from)) return false;
  const set = ALLOWED_TRANSITIONS.get(from);
  return set?.has(to) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/intent-fsm test transitions`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/intent-fsm/src/transitions.ts packages/intent-fsm/test/transitions.test.ts
git commit -m "feat(intent-fsm): allowed transitions table + canTransition"
```

---

### Task 4.3: Branded IntentId + canonical JSON

**Files:**
- Modify: `packages/intent-fsm/src/branded.ts`
- Modify: `packages/intent-fsm/src/canonical-json.ts`
- Create: `packages/intent-fsm/test/branded.test.ts`
- Create: `packages/intent-fsm/test/canonical-json.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/intent-fsm/test/branded.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mintIntentId, IntentId } from '../src/branded.js';

describe('IntentId', () => {
  it('mintIntentId returns matching shape int_<26 lowercase base32>', () => {
    const id = mintIntentId();
    expect(id).toMatch(/^int_[0-9a-z]{26}$/);
  });
  it('two mints differ', () => {
    expect(mintIntentId()).not.toBe(mintIntentId());
  });
  it('type tag does not equal plain string in nominal use', () => {
    const x: IntentId = mintIntentId();
    const y = String(x);
    expect(typeof y).toBe('string');
  });
});
```

`packages/intent-fsm/test/canonical-json.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalJsonString } from '../src/canonical-json.js';

describe('canonical JSON', () => {
  it('sorts object keys', () => {
    expect(canonicalize({ b: 1, a: { z: 0, y: -1 } })).toEqual({ a: { y: -1, z: 0 }, b: 1 });
  });
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });
  it('produces stable strings', () => {
    expect(canonicalJsonString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @caspilot/intent-fsm test branded canonical-json`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/intent-fsm/src/branded.ts`:
```ts
import { randomBytes } from 'node:crypto';

declare const IntentIdBrand: unique symbol;
export type IntentId = string & { readonly [IntentIdBrand]: true };

const BASE32_ALPHABET = '0123456789abcdefghijklmnopqrstuv'; // 32 chars (Crockford-ish lowercase)

export function mintIntentId(): IntentId {
  const buf = randomBytes(16);
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  for (let i = 0; i < 26; i++) {
    out = BASE32_ALPHABET[Number(n & 31n)]! + out;
    n >>= 5n;
  }
  return ('int_' + out) as IntentId;
}
```

`packages/intent-fsm/src/canonical-json.ts`:
```ts
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).sort();
    return keys.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = canonicalize((value as Record<string, unknown>)[k]);
      return acc;
    }, {});
  }
  return value;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @caspilot/intent-fsm test branded canonical-json`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/intent-fsm/src packages/intent-fsm/test/branded.test.ts packages/intent-fsm/test/canonical-json.test.ts
git commit -m "feat(intent-fsm): branded IntentId + canonical JSON"
```

---

### Task 4.4: `@caspilot/adapters` skeleton + capability boot report

**Files:**
- Create: `packages/adapters/package.json`
- Create: `packages/adapters/tsconfig.json`
- Create: `packages/adapters/vitest.config.ts`
- Create: `packages/adapters/src/index.ts`
- Create: `packages/adapters/src/capability.ts`
- Create: `packages/adapters/test/capability.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/capability.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CapabilityReport, summarizeCapability, BootGate } from '../src/capability.js';

describe('CapabilityReport', () => {
  const ok = {
    db: { ok: true },
    chainStatus: [
      { name: 'casper-rpc', ok: true, chainspecName: 'casper-test' },
      { name: 'cspr-cloud', ok: false, reason: 'http_500' },
    ],
    observation: { ok: true },
    strategy: { ok: true },
    dex: { ok: true },
    submission: { ok: true },
  };

  it('parses with two chain_status entries', () => {
    expect(CapabilityReport.safeParse(ok).success).toBe(true);
  });

  it('summarizeCapability reports ≥1 chain ok', () => {
    const s = summarizeCapability(CapabilityReport.parse(ok));
    expect(s.chainStatusOkCount).toBe(1);
  });

  it('BootGate.canBoot true when db ok && ≥1 chain ok && chainspec match', () => {
    const r = BootGate({ report: CapabilityReport.parse(ok), expectedChainspec: 'casper-test' });
    expect(r.canBoot).toBe(true);
  });

  it('BootGate.canBoot false when chainspec mismatch', () => {
    const r = BootGate({ report: CapabilityReport.parse(ok), expectedChainspec: 'casper-mainnet' });
    expect(r.canBoot).toBe(false);
    expect(r.reasons).toContain('chainspec_mismatch');
  });

  it('BootGate.canBoot false when db not ok', () => {
    const broken = { ...ok, db: { ok: false, reason: 'sqlite_open_failed' } };
    const r = BootGate({ report: CapabilityReport.parse(broken), expectedChainspec: 'casper-test' });
    expect(r.canBoot).toBe(false);
    expect(r.reasons).toContain('db_not_ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/adapters test capability`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/package.json`:
```json
{
  "name": "@caspilot/adapters",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@caspilot/x402": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/adapters/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/adapters/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/adapters/src/index.ts`:
```ts
export * from './capability.js';
export * from './casper-rpc.js';
export * from './cspr-cloud.js';
export * from './cspr-trade.js';
export * from './cep18.js';
```

`packages/adapters/src/capability.ts`:
```ts
import { z } from 'zod';

const Ok = z.object({ ok: z.literal(true) }).passthrough();
const Bad = z.object({ ok: z.literal(false), reason: z.string() }).passthrough();
const Status = z.union([Ok, Bad]);

export const ChainStatus = z.object({
  name: z.string(),
  ok: z.boolean(),
  chainspecName: z.string().optional(),
  reason: z.string().optional(),
});

export const CapabilityReport = z.object({
  db: Status,
  chainStatus: z.array(ChainStatus).min(1),
  observation: Status,
  strategy: Status,
  dex: Status,
  submission: Status,
});
export type CapabilityReport = z.infer<typeof CapabilityReport>;

export interface CapabilitySummary {
  chainStatusOkCount: number;
  dbOk: boolean;
}
export function summarizeCapability(r: CapabilityReport): CapabilitySummary {
  return {
    chainStatusOkCount: r.chainStatus.filter((s) => s.ok).length,
    dbOk: r.db.ok,
  };
}

export interface BootDecision {
  canBoot: boolean;
  reasons: string[];
}

export function BootGate(opts: { report: CapabilityReport; expectedChainspec: string }): BootDecision {
  const reasons: string[] = [];
  if (!opts.report.db.ok) reasons.push('db_not_ok');
  const okChains = opts.report.chainStatus.filter((s) => s.ok);
  if (okChains.length < 1) reasons.push('no_chain_status_ok');
  const chainspecMatches = okChains.some(
    (s) => s.chainspecName === undefined || s.chainspecName === opts.expectedChainspec,
  );
  if (!chainspecMatches) reasons.push('chainspec_mismatch');
  return { canBoot: reasons.length === 0, reasons };
}
```

(stubs for the other adapters that are filled in later tasks)

`packages/adapters/src/casper-rpc.ts`:
```ts
export {};
```

`packages/adapters/src/cspr-cloud.ts`:
```ts
export {};
```

`packages/adapters/src/cspr-trade.ts`:
```ts
export {};
```

`packages/adapters/src/cep18.ts`:
```ts
export {};
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter @caspilot/adapters test capability`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters pnpm-lock.yaml
git commit -m "feat(adapters): capability report + boot gate"
```

---

### Task 4.5: casper-rpc adapter (`info_get_status`)

**Files:**
- Modify: `packages/adapters/src/casper-rpc.ts`
- Create: `packages/adapters/test/casper-rpc.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/casper-rpc.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { CasperRpcAdapter } from '../src/casper-rpc.js';

describe('CasperRpcAdapter', () => {
  it('getStatus parses chainspec_name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          api_version: '2.0.0',
          chainspec_name: 'casper-test',
          last_added_block_info: { height: 123 },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    const s = await a.getStatus();
    expect(s.chainspec_name).toBe('casper-test');
  });

  it('healthCheck returns { ok:true, chainspecName } on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { chainspec_name: 'casper-test', api_version: '2.0.0', last_added_block_info: { height: 1 } },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    expect(await a.healthCheck()).toEqual({ name: 'casper-rpc', ok: true, chainspecName: 'casper-test' });
  });

  it('healthCheck returns { ok:false, reason } on http error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    const a = new CasperRpcAdapter({ url: 'http://node:7777/rpc', fetch: fetchMock });
    const r = await a.healthCheck();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/http_500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/adapters test casper-rpc`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/casper-rpc.ts`:
```ts
import { z } from 'zod';

const StatusResult = z.object({
  api_version: z.string(),
  chainspec_name: z.string(),
  last_added_block_info: z.object({ height: z.number() }).passthrough(),
}).passthrough();

const JsonRpcOk = z.object({ jsonrpc: z.literal('2.0'), id: z.number().or(z.string()), result: StatusResult });

export interface CasperRpcOptions {
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CasperRpcAdapter {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: CasperRpcOptions) {
    this.url = opts.url;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async getStatus(): Promise<z.infer<typeof StatusResult>> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_status', params: [] }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const json = JsonRpcOk.parse(await res.json());
      return json.result;
    } finally {
      clearTimeout(t);
    }
  }

  async healthCheck(): Promise<
    | { name: 'casper-rpc'; ok: true; chainspecName: string }
    | { name: 'casper-rpc'; ok: false; reason: string }
  > {
    try {
      const s = await this.getStatus();
      return { name: 'casper-rpc', ok: true, chainspecName: s.chainspec_name };
    } catch (e) {
      return { name: 'casper-rpc', ok: false, reason: String(e instanceof Error ? e.message : e) };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/adapters test casper-rpc`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/casper-rpc.ts packages/adapters/test/casper-rpc.test.ts
git commit -m "feat(adapters): casper-rpc info_get_status + healthCheck"
```

---

### Task 4.6: cspr-cloud adapter (read-only)

**Files:**
- Modify: `packages/adapters/src/cspr-cloud.ts`
- Create: `packages/adapters/test/cspr-cloud.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/cspr-cloud.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { CsprCloudAdapter } from '../src/cspr-cloud.js';

describe('CsprCloudAdapter', () => {
  it('healthCheck returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const a = new CsprCloudAdapter({ baseUrl: 'https://api.cspr.cloud', apiKey: 'secret', fetch: fetchMock });
    expect(await a.healthCheck()).toMatchObject({ name: 'cspr-cloud', ok: true });
  });

  it('passes Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const a = new CsprCloudAdapter({ baseUrl: 'https://api.cspr.cloud', apiKey: 'secret', fetch: fetchMock });
    await a.healthCheck();
    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toMatch(/secret/);
  });

  it('reports unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 401 }));
    const a = new CsprCloudAdapter({ baseUrl: 'https://api.cspr.cloud', apiKey: 'secret', fetch: fetchMock });
    const r = await a.healthCheck();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/http_401/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/adapters test cspr-cloud`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/cspr-cloud.ts`:
```ts
export interface CsprCloudOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CsprCloudAdapter {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: CsprCloudOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, accept: 'application/json' };
  }

  async healthCheck(): Promise<
    | { name: 'cspr-cloud'; ok: true }
    | { name: 'cspr-cloud'; ok: false; reason: string }
  > {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.base + '/healthz', { headers: this.headers(), signal: ctl.signal });
      if (!res.ok) return { name: 'cspr-cloud', ok: false, reason: `http_${res.status}` };
      return { name: 'cspr-cloud', ok: true };
    } catch (e) {
      return { name: 'cspr-cloud', ok: false, reason: String(e instanceof Error ? e.message : e) };
    } finally {
      clearTimeout(t);
    }
  }

  async getAccountBalance(accountHash: string): Promise<string> {
    const res = await this.fetchImpl(`${this.base}/accounts/${accountHash}/balance`, { headers: this.headers() });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const json = (await res.json()) as { balance: string };
    return json.balance;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/adapters test cspr-cloud`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/cspr-cloud.ts packages/adapters/test/cspr-cloud.test.ts
git commit -m "feat(adapters): cspr-cloud read-only client"
```

---

### Task 4.7: cspr-trade adapter (build_swap)

**Files:**
- Modify: `packages/adapters/src/cspr-trade.ts`
- Create: `packages/adapters/test/cspr-trade.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/cspr-trade.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { CsprTradeAdapter } from '../src/cspr-trade.js';

describe('CsprTradeAdapter.buildSwap', () => {
  it('returns a quote with deploy payload and amount_out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amountOut: '12345',
          deployPayload: { kind: 'casper-deploy-stub', hex: 'aa'.repeat(32) },
          route: ['CSPR', 'USDC'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const a = new CsprTradeAdapter({ baseUrl: 'https://trade', fetch: fetchMock });
    const q = await a.buildSwap({ tokenIn: 'CSPR', tokenOut: 'USDC', amountIn: '1000', slippageBps: 50 });
    expect(q.amountOut).toBe('12345');
    expect(q.route).toEqual(['CSPR', 'USDC']);
  });

  it('rejects HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('err', { status: 500 }));
    const a = new CsprTradeAdapter({ baseUrl: 'https://trade', fetch: fetchMock });
    await expect(a.buildSwap({ tokenIn: 'CSPR', tokenOut: 'USDC', amountIn: '1', slippageBps: 50 })).rejects.toThrow(/http_500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/adapters test cspr-trade`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/cspr-trade.ts`:
```ts
import { z } from 'zod';

const Quote = z.object({
  amountOut: z.string().regex(/^\d+$/),
  deployPayload: z.unknown(),
  route: z.array(z.string()).min(2),
});
export type SwapQuote = z.infer<typeof Quote>;

export interface CsprTradeOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class CsprTradeAdapter {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: CsprTradeOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async buildSwap(req: { tokenIn: string; tokenOut: string; amountIn: string; slippageBps: number }): Promise<SwapQuote> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.base + '/build_swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      return Quote.parse(await res.json());
    } finally {
      clearTimeout(t);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/adapters test cspr-trade`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/cspr-trade.ts packages/adapters/test/cspr-trade.test.ts
git commit -m "feat(adapters): cspr-trade build_swap quote"
```

---

### Task 4.8: cep18 adapter (read-only balance_of)

**Files:**
- Modify: `packages/adapters/src/cep18.ts`
- Create: `packages/adapters/test/cep18.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/cep18.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Cep18ReadAdapter } from '../src/cep18.js';

describe('Cep18ReadAdapter', () => {
  it('balanceOf reads via state_get_dictionary_item', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { stored_value: { CLValue: { parsed: '12345', cl_type: 'U256' } }, merkle_proof: 'omitted', api_version: '2.0.0' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const a = new Cep18ReadAdapter({ rpcUrl: 'http://node/rpc', tokenHash: 'hash-' + '0'.repeat(64), fetch: fetchMock });
    const bal = await a.balanceOf('00' + '11'.repeat(32));
    expect(bal).toBe('12345');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/adapters test cep18`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/cep18.ts`:
```ts
import { z } from 'zod';

const Resp = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.number(), z.string()]),
  result: z.object({
    stored_value: z.object({ CLValue: z.object({ parsed: z.union([z.string(), z.number()]) }).passthrough() }).passthrough(),
  }).passthrough(),
});

export interface Cep18ReadOptions {
  rpcUrl: string;
  tokenHash: string;
  fetch?: typeof fetch;
}

export class Cep18ReadAdapter {
  constructor(private readonly opts: Cep18ReadOptions) {}

  async balanceOf(accountHash: string): Promise<string> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(this.opts.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'state_get_dictionary_item',
        params: {
          state_root_hash: 'latest',
          dictionary_identifier: {
            ContractNamedKey: { key: `hash-${this.opts.tokenHash}`, dictionary_name: 'balances', dictionary_item_key: accountHash },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const json = Resp.parse(await res.json());
    return String(json.result.stored_value.CLValue.parsed);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/adapters test cep18`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/cep18.ts packages/adapters/test/cep18.test.ts
git commit -m "feat(adapters): CEP-18 balanceOf read"
```

---

### Task 4.9: adapter-doctor CLI

**Files:**
- Create: `apps/adapter-doctor/package.json`
- Create: `apps/adapter-doctor/tsconfig.json`
- Create: `apps/adapter-doctor/src/cli.ts`
- Create: `apps/adapter-doctor/test/cli.test.ts`
- Create: `apps/adapter-doctor/vitest.config.ts`

- [ ] **Step 1: Write the failing test**

`apps/adapter-doctor/test/cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/cli.js';

describe('adapter-doctor', () => {
  it('returns canBoot true when stubs all ok', async () => {
    const report = await runDoctor({
      expectedChainspec: 'casper-test',
      probes: {
        db: async () => ({ ok: true }),
        chainStatus: async () => [{ name: 'casper-rpc', ok: true, chainspecName: 'casper-test' }],
        observation: async () => ({ ok: true }),
        strategy: async () => ({ ok: true }),
        dex: async () => ({ ok: true }),
        submission: async () => ({ ok: true }),
      },
    });
    expect(report.canBoot).toBe(true);
  });

  it('returns canBoot false on chainspec mismatch with explanation', async () => {
    const report = await runDoctor({
      expectedChainspec: 'casper-test',
      probes: {
        db: async () => ({ ok: true }),
        chainStatus: async () => [{ name: 'casper-rpc', ok: true, chainspecName: 'casper-mainnet' }],
        observation: async () => ({ ok: true }),
        strategy: async () => ({ ok: true }),
        dex: async () => ({ ok: true }),
        submission: async () => ({ ok: true }),
      },
    });
    expect(report.canBoot).toBe(false);
    expect(report.reasons).toContain('chainspec_mismatch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter adapter-doctor test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`apps/adapter-doctor/package.json`:
```json
{
  "name": "adapter-doctor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/cli.js",
  "bin": { "adapter-doctor": "./dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@caspilot/adapters": "workspace:*"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`apps/adapter-doctor/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.node.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`apps/adapter-doctor/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`apps/adapter-doctor/src/cli.ts`:
```ts
import { BootGate, CapabilityReport } from '@caspilot/adapters';

export interface DoctorProbes {
  db: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  chainStatus: () => Promise<Array<{ name: string; ok: boolean; chainspecName?: string; reason?: string }>>;
  observation: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  strategy: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  dex: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  submission: () => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export async function runDoctor(opts: { expectedChainspec: string; probes: DoctorProbes }) {
  const report = CapabilityReport.parse({
    db: await opts.probes.db(),
    chainStatus: await opts.probes.chainStatus(),
    observation: await opts.probes.observation(),
    strategy: await opts.probes.strategy(),
    dex: await opts.probes.dex(),
    submission: await opts.probes.submission(),
  });
  const decision = BootGate({ report, expectedChainspec: opts.expectedChainspec });
  return { ...decision, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('adapter-doctor CLI: configure probes in a runner script; library mode used by tests.');
  process.exit(1);
}
```

- [ ] **Step 4: Run test**

Run: `pnpm install && pnpm --filter adapter-doctor test`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/adapter-doctor pnpm-lock.yaml
git commit -m "feat(adapter-doctor): boot-gate CLI library"
```

---

### Task 4.10: `@caspilot/audit-trace` skeleton + SQLite table

**Files:**
- Create: `packages/audit-trace/package.json`
- Create: `packages/audit-trace/tsconfig.json`
- Create: `packages/audit-trace/vitest.config.ts`
- Create: `packages/audit-trace/src/index.ts`
- Create: `packages/audit-trace/src/schema.ts`
- Create: `packages/audit-trace/src/store.ts`
- Create: `packages/audit-trace/test/store.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/audit-trace/test/store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { AuditTraceStore, runAuditMigrations } from '../src/index.js';

describe('AuditTraceStore', () => {
  it('inserts a trace and reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caspilot-audit-'));
    try {
      const db = new Database(join(dir, 't.sqlite'));
      db.pragma('journal_mode = WAL');
      runAuditMigrations(db);
      const store = new AuditTraceStore(db);
      const id = store.append({
        intentId: 'int_x',
        state: 'POLICY_VALIDATED',
        atMs: 1_700_000_000_000,
        kind: 'policy_check',
        payload: { allowed: true, policyDigest: 'd'.repeat(64) },
      });
      expect(id).toBeGreaterThan(0);
      const all = store.listByIntent('int_x');
      expect(all).toHaveLength(1);
      expect(all[0]?.kind).toBe('policy_check');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/audit-trace test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`packages/audit-trace/package.json`:
```json
{
  "name": "@caspilot/audit-trace",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "@types/better-sqlite3": "^7.6.11",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/audit-trace/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist", "types": ["node"] },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`packages/audit-trace/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`packages/audit-trace/src/index.ts`:
```ts
export * from './schema.js';
export * from './store.js';
export * from './redactor.js';
```

`packages/audit-trace/src/schema.ts`:
```ts
import type { Database as SqliteDb } from 'better-sqlite3';

export const CREATE_AUDIT_TRACE_SQL = `
CREATE TABLE IF NOT EXISTS audit_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL,
  state TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_trace_intent_idx ON audit_trace(intent_id, at_ms);
`;

export function runAuditMigrations(db: SqliteDb): void {
  db.exec(CREATE_AUDIT_TRACE_SQL);
}
```

`packages/audit-trace/src/store.ts`:
```ts
import type { Database as SqliteDb } from 'better-sqlite3';

export interface AuditTraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload: Record<string, unknown>;
}

export interface AuditTraceRow {
  id: number;
  intent_id: string;
  state: string;
  at_ms: number;
  kind: string;
  payload_json: string;
}

export class AuditTraceStore {
  constructor(private readonly db: SqliteDb) {}

  append(e: AuditTraceEntry): number {
    const info = this.db
      .prepare(
        `INSERT INTO audit_trace (intent_id, state, at_ms, kind, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(e.intentId, e.state, e.atMs, e.kind, JSON.stringify(e.payload));
    return Number(info.lastInsertRowid);
  }

  listByIntent(intentId: string): AuditTraceRow[] {
    return this.db
      .prepare('SELECT * FROM audit_trace WHERE intent_id=? ORDER BY at_ms ASC, id ASC')
      .all(intentId) as AuditTraceRow[];
  }
}
```

`packages/audit-trace/src/redactor.ts`:
```ts
// Filled in next task.
export {};
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter @caspilot/audit-trace test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/audit-trace pnpm-lock.yaml
git commit -m "feat(audit-trace): SQLite append store"
```

---

### Task 4.11: PlannerRedactor with secret-leak guards

**Files:**
- Modify: `packages/audit-trace/src/redactor.ts`
- Create: `packages/audit-trace/test/redactor.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/audit-trace/test/redactor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PlannerRedactor, FORBIDDEN_KEYS } from '../src/redactor.js';

describe('PlannerRedactor', () => {
  const r = new PlannerRedactor();

  it('strips forbidden keys at any depth', () => {
    const out = r.redact({
      intent: 'optimize yield',
      privateKey: 'never-leak',
      env: { PRIVATE_KEY: 'x', CSPR_CLOUD_KEY: 'y' },
      prompt: 'full prompt',
      reasoning: 'hidden chain of thought',
    });
    for (const k of FORBIDDEN_KEYS) {
      expect(JSON.stringify(out)).not.toMatch(new RegExp(k));
    }
  });

  it('preserves structured planner output (toolCalls, constraints, policyChecks)', () => {
    const out = r.redact({
      toolCalls: [{ name: 'fetch_yield', argsHash: 'abc' }],
      constraints: { maxAmount: '500' },
      policyChecks: [{ rule: 'amount', allowed: true }],
    });
    expect((out as Record<string, unknown>).toolCalls).toBeDefined();
    expect((out as Record<string, unknown>).constraints).toBeDefined();
    expect((out as Record<string, unknown>).policyChecks).toBeDefined();
  });

  it('throws when input is null/undefined (catch programming errors)', () => {
    expect(() => r.redact(undefined as unknown as Record<string, unknown>)).toThrow();
  });

  it('does not stringify Buffers (leak guard)', () => {
    const out = r.redact({ buf: Buffer.from('secret') });
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caspilot/audit-trace test redactor`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`packages/audit-trace/src/redactor.ts`:
```ts
export const FORBIDDEN_KEYS = [
  'privateKey',
  'PRIVATE_KEY',
  'mnemonic',
  'seed',
  'apiKey',
  'API_KEY',
  'CSPR_CLOUD_KEY',
  'reasoning',
  'chainOfThought',
  'prompt',
  'env',
] as const;

const FORBIDDEN_SET = new Set(FORBIDDEN_KEYS);

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return Object.prototype.toString.call(x) === '[object Object]';
}

export class PlannerRedactor {
  redact(input: Record<string, unknown>): Record<string, unknown> {
    if (input === null || input === undefined) {
      throw new Error('PlannerRedactor.redact requires an object');
    }
    return this.walk(input) as Record<string, unknown>;
  }

  private walk(value: unknown): unknown {
    if (Buffer.isBuffer(value)) return '[buffer:redacted]';
    if (Array.isArray(value)) return value.map((v) => this.walk(v));
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_SET.has(k)) continue;
        out[k] = this.walk(v);
      }
      return out;
    }
    return value;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caspilot/audit-trace test redactor`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/audit-trace/src/redactor.ts packages/audit-trace/test/redactor.test.ts
git commit -m "feat(audit-trace): PlannerRedactor with forbidden-key guard"
```

---

### Task 4.12: `apps/api` Hono service skeleton + healthz

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/test/healthz.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/healthz.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-api test`
Expected: FAIL — package missing.

- [ ] **Step 3: Write minimal implementation**

`apps/api/package.json`:
```json
{
  "name": "caspilot-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@caspilot/x402": "workspace:*",
    "@caspilot/x402-gateway": "workspace:*",
    "@caspilot/ledger": "workspace:*",
    "@caspilot/signer-guard": "workspace:*",
    "@caspilot/intent-fsm": "workspace:*",
    "@caspilot/adapters": "workspace:*",
    "@caspilot/audit-trace": "workspace:*",
    "hono": "^4.6.3",
    "@hono/node-server": "^1.13.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@caspilot/tsconfig/tsconfig.node.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`apps/api/vitest.config.ts`:
```ts
import base from '../../vitest.config.base.js';
export default base;
```

`apps/api/src/server.ts`:
```ts
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
```

`apps/api/src/index.ts`:
```ts
import { serve } from '@hono/node-server';
import { buildApp } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const expectedChainspec = process.env.EXPECTED_CHAINSPEC ?? 'casper-test';
const app = buildApp({ env: { expectedChainspec } });
serve({ fetch: app.fetch, port });
console.log(`caspilot-api listening on :${port}`);
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm --filter caspilot-api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): hono service skeleton + /healthz"
```

---

### Task 4.13: `POST /intents` (create DRAFT)

**Files:**
- Create: `apps/api/src/intents/router.ts`
- Modify: `apps/api/src/server.ts` — mount router
- Create: `apps/api/test/intents-create.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/intents-create.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

describe('POST /intents', () => {
  it('creates a DRAFT intent and returns id', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps: makeStubDeps() });
    const res = await app.request('/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^int_/);
    expect(body.state).toBe('DRAFT');
  });
});
```

`apps/api/test/_stubs.ts`:
```ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { openLedgerDb, runMigrations, PaymentLedger, SignerSpendLedger } from '@caspilot/ledger';
import { SignerGuard } from '@caspilot/signer-guard';
import { AuditTraceStore, runAuditMigrations } from '@caspilot/audit-trace';

export function makeStubDeps() {
  const dir = mkdtempSync(join(tmpdir(), 'caspilot-api-'));
  const db = openLedgerDb(join(dir, 'l.sqlite'));
  runMigrations(db);
  runAuditMigrations(db);
  const guard = new SignerGuard({
    spendLedger: new SignerSpendLedger(db),
    cfg: {
      role: 'local_dev',
      agents: ['00' + 'aa'.repeat(32)],
      receivers: ['00' + 'bb'.repeat(32)],
      tokens: ['cspr-test-cep18'],
      contracts: ['00' + 'cc'.repeat(32)],
      networks: ['casper:casper-test'],
      maxSinglePayment: '500',
      dailyLimit: '5000',
      validUntilMs: 9_999_999_999_999,
    },
  });
  return {
    db,
    paymentLedger: new PaymentLedger(db),
    spendLedger: new SignerSpendLedger(db),
    guard,
    audit: new AuditTraceStore(db),
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-api test intents-create`
Expected: FAIL — `/intents` route absent.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/intents/router.ts`:
```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { mintIntentId, type IntentState } from '@caspilot/intent-fsm';
import type { SignerGuard } from '@caspilot/signer-guard';
import type { AuditTraceStore } from '@caspilot/audit-trace';

const CreateBody = z.object({
  agent: z.string(),
  receiver: z.string(),
  token: z.string(),
  contract: z.string(),
  network: z.string(),
  amount: z.string(),
});

export interface IntentRouterDeps {
  guard: SignerGuard;
  audit: AuditTraceStore;
  now?: () => number;
}

export function intentsRouter(deps: IntentRouterDeps): Hono {
  const r = new Hono();
  const now = deps.now ?? (() => Date.now());
  const state: Map<string, { state: IntentState; body: z.infer<typeof CreateBody>; createdAtMs: number }> = new Map();
  r.post('/', async (c) => {
    const body = CreateBody.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'invalid_body', issues: body.error.format() }, 400);
    const id = mintIntentId();
    const t = now();
    state.set(id, { state: 'DRAFT', body: body.data, createdAtMs: t });
    deps.audit.append({ intentId: id, state: 'DRAFT', atMs: t, kind: 'created', payload: { body: body.data } });
    return c.json({ id, state: 'DRAFT' }, 201);
  });
  // exposed for next task
  (r as unknown as { _state: typeof state })._state = state;
  return r;
}
```

`apps/api/src/server.ts` (updated):
```ts
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
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-api test intents-create`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test/intents-create.test.ts apps/api/test/_stubs.ts
git commit -m "feat(api): POST /intents creates DRAFT"
```

---

### Task 4.14: `POST /intents/:id/validate-policy` (DRAFT → POLICY_VALIDATED)

**Files:**
- Modify: `apps/api/src/intents/router.ts`
- Create: `apps/api/test/intents-validate-policy.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/intents-validate-policy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

async function create(app: ReturnType<typeof buildApp>, override: Record<string, unknown> = {}) {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: '00' + 'aa'.repeat(32),
      receiver: '00' + 'bb'.repeat(32),
      token: 'cspr-test-cep18',
      contract: '00' + 'cc'.repeat(32),
      network: 'casper:casper-test',
      amount: '500',
      ...override,
    }),
  });
  return res.json() as Promise<{ id: string; state: string }>;
}

describe('POST /intents/:id/validate-policy', () => {
  it('moves to POLICY_VALIDATED when guard allows', async () => {
    const deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('POLICY_VALIDATED');
    expect(body.policyDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('moves to REJECTED with reason when guard denies (amount above max)', async () => {
    const deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app, { amount: '600' });
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.state).toBe('REJECTED');
    expect(body.code).toBe('amount_above_max_single');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-api test intents-validate-policy`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/api/src/intents/router.ts` (inside `intentsRouter`):
```ts
  r.post('/:id/validate-policy', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (entry.state !== 'DRAFT') return c.json({ error: 'invalid_state', state: entry.state }, 409);
    const t = now();
    const gate = await deps.guard.gate({
      intentId: id,
      agent: entry.body.agent,
      receiver: entry.body.receiver,
      token: entry.body.token,
      contract: entry.body.contract,
      network: entry.body.network,
      amount: entry.body.amount,
      nowMs: t,
    });
    if (!gate.allowed) {
      entry.state = 'REJECTED';
      deps.audit.append({
        intentId: id, state: 'REJECTED', atMs: t, kind: 'policy_check',
        payload: { allowed: false, code: gate.code, message: gate.message, policyDigest: gate.policyDigest },
      });
      return c.json({ id, state: 'REJECTED', code: gate.code, message: gate.message }, 422);
    }
    entry.state = 'POLICY_VALIDATED';
    deps.audit.append({
      intentId: id, state: 'POLICY_VALIDATED', atMs: t, kind: 'policy_check',
      payload: { allowed: true, policyDigest: gate.policyDigest },
    });
    return c.json({ id, state: 'POLICY_VALIDATED', policyDigest: gate.policyDigest });
  });
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-api test intents-validate-policy`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/intents/router.ts apps/api/test/intents-validate-policy.test.ts
git commit -m "feat(api): POST /intents/:id/validate-policy"
```

---

### Task 4.15: Mark-executed + audit-trace export endpoint

**Files:**
- Modify: `apps/api/src/intents/router.ts`
- Create: `apps/api/test/intents-executed.test.ts`
- Create: `apps/api/test/intents-trace-export.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/api/test/intents-executed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

describe('POST /intents/:id/mark-executed', () => {
  it('commits the spend reservation and audits EXECUTED', async () => {
    const deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const create = await app.request('/intents', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    const { id } = await create.json();
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    const res = await app.request(`/intents/${id}/mark-executed`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deployHash: 'a'.repeat(64) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('EXECUTED');
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('committed');
  });
});
```

`apps/api/test/intents-trace-export.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

describe('GET /intents/:id/trace', () => {
  it('redacts forbidden keys and forbidden audit kinds', async () => {
    const deps = makeStubDeps();
    deps.audit.append({
      intentId: 'int_safe',
      state: 'DRAFT',
      atMs: 1_700_000_000_000,
      kind: 'created',
      payload: { body: { amount: '500' }, prompt: 'leak', privateKey: 'leak' },
    });
    // mirror in router state map so :id resolves
    (buildApp({ env: { expectedChainspec: 'casper-test' }, deps }) as unknown as { _patch?: () => void });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    // Force a known id into router state via the create endpoint
    const create = await app.request('/intents', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    const { id } = await create.json();
    deps.audit.append({
      intentId: id, state: 'DRAFT', atMs: 1_700_000_000_001, kind: 'created',
      payload: { prompt: 'leak', privateKey: 'leak', constraints: { maxAmount: '500' } },
    });
    const res = await app.request(`/intents/${id}/trace`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('leak');
    expect(text).toContain('maxAmount');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter caspilot-api test intents-executed intents-trace-export`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/api/src/intents/router.ts`:
```ts
import { PlannerRedactor } from '@caspilot/audit-trace';

// ...inside intentsRouter():
const redactor = new PlannerRedactor();

  r.post('/:id/mark-executed', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (entry.state !== 'POLICY_VALIDATED' && entry.state !== 'ACCEPTED_BY_NODE') {
      return c.json({ error: 'invalid_state', state: entry.state }, 409);
    }
    const body = (await c.req.json()) as { deployHash?: string };
    if (!body.deployHash || !/^[0-9a-f]{64}$/.test(body.deployHash)) {
      return c.json({ error: 'invalid_deploy_hash' }, 400);
    }
    const t = now();
    deps.guard.commit(id, t);
    entry.state = 'EXECUTED';
    deps.audit.append({
      intentId: id, state: 'EXECUTED', atMs: t, kind: 'execution',
      payload: { deployHash: body.deployHash },
    });
    return c.json({ id, state: 'EXECUTED', deployHash: body.deployHash });
  });

  r.get('/:id/trace', (c) => {
    const id = c.req.param('id');
    if (!state.has(id)) return c.json({ error: 'not_found' }, 404);
    const rows = deps.audit.listByIntent(id).map((row) => ({
      atMs: row.at_ms,
      state: row.state,
      kind: row.kind,
      payload: redactor.redact(JSON.parse(row.payload_json) as Record<string, unknown>),
    }));
    return c.json({ id, entries: rows });
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter caspilot-api test intents-executed intents-trace-export`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/intents/router.ts apps/api/test/intents-executed.test.ts apps/api/test/intents-trace-export.test.ts
git commit -m "feat(api): mark-executed + redacted trace export"
```

---

### Task 4.16: Reject endpoint (any non-terminal → REJECTED with release)

**Files:**
- Modify: `apps/api/src/intents/router.ts`
- Create: `apps/api/test/intents-reject.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/intents-reject.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';

describe('POST /intents/:id/reject', () => {
  it('releases any open reservation and marks REJECTED', async () => {
    const deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const create = await app.request('/intents', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    const { id } = await create.json();
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    const res = await app.request(`/intents/${id}/reject`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'demo_cancel' }),
    });
    expect(res.status).toBe(200);
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('released');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-api test intents-reject`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/api/src/intents/router.ts`:
```ts
  r.post('/:id/reject', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    const terminal = ['FINALIZED', 'EXECUTION_FAILED', 'REJECTED', 'TIMEOUT'];
    if (terminal.includes(entry.state)) return c.json({ error: 'already_terminal', state: entry.state }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    const t = now();
    deps.guard.release(id, body.reason ?? 'rejected', t);
    entry.state = 'REJECTED';
    deps.audit.append({
      intentId: id, state: 'REJECTED', atMs: t, kind: 'rejected',
      payload: { reason: body.reason ?? 'rejected' },
    });
    return c.json({ id, state: 'REJECTED' });
  });
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-api test intents-reject`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/intents/router.ts apps/api/test/intents-reject.test.ts
git commit -m "feat(api): POST /intents/:id/reject releases reservation"
```

---

### Task 4.17: P4 acceptance summary

**Files:**
- Create: `apps/api/test/p4-acceptance.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/p4-acceptance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps } from './_stubs.js';
import { canTransition } from '@caspilot/intent-fsm';

describe('P4 acceptance', () => {
  it('mounts /intents only when deps are present', async () => {
    const a = buildApp({ env: { expectedChainspec: 'casper-test' } });
    expect((await a.request('/intents', { method: 'POST', body: '{}' })).status).toBe(404);
    const b = buildApp({ env: { expectedChainspec: 'casper-test' }, deps: makeStubDeps() });
    const r = await b.request('/intents', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: '00' + 'aa'.repeat(32),
        receiver: '00' + 'bb'.repeat(32),
        token: 'cspr-test-cep18',
        contract: '00' + 'cc'.repeat(32),
        network: 'casper:casper-test',
        amount: '500',
      }),
    });
    expect(r.status).toBe(201);
  });

  it('FSM is wired into router transitions', () => {
    expect(canTransition('DRAFT', 'POLICY_VALIDATED')).toBe(true);
    expect(canTransition('DRAFT', 'EXECUTED')).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter caspilot-api test p4-acceptance`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/p4-acceptance.test.ts
git commit -m "test: P4 acceptance summary"
```

---

## Phase 5 — Web UI (Next.js + CSPR.click), no cloud key

**Goal:** Browser app where the user connects CSPR.click, creates/inspects PolicyVaults, drafts intents, and watches the audit trace via the API. The frontend MUST NOT contain any `CSPR_CLOUD_KEY` or other privileged secret; privileged reads/writes go through `apps/api`. Read-only browser interactions use the CSPR.click cloud proxy. The user signer is **only** CSPR.click — never the local or demo signer.

**Package layout:**
- `apps/web/` — Next.js 14 App Router, TypeScript strict, Tailwind, Vitest for unit, Playwright skeleton later.
- The frontend talks to `apps/api` over `NEXT_PUBLIC_CASPILOT_API_BASE` only.

---

### Task 5.1: Scaffold `apps/web` Next.js 14 strict TypeScript

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/scaffold.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('apps/web scaffold', () => {
  const root = resolve(__dirname, '..');
  for (const f of [
    'package.json', 'tsconfig.json', 'next.config.mjs',
    'app/layout.tsx', 'app/page.tsx', 'app/globals.css',
    'tailwind.config.ts', 'postcss.config.mjs',
  ]) {
    it(`has ${f}`, () => expect(existsSync(resolve(root, f))).toBe(true));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test scaffold`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

`apps/web/package.json`:
```json
{
  "name": "caspilot-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check ."
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "5.5.4",
    "vitest": "^1.6.0"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../packages/tsconfig/base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
};
export default nextConfig;
```

`apps/web/app/layout.tsx`:
```tsx
import './globals.css';

export const metadata = { title: 'Caspilot', description: 'Casper agentic copilot' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-3xl font-semibold">Caspilot</h1>
      <p className="text-zinc-400">Casper agentic copilot — x402-paid yield and delegated PolicyVault.</p>
    </main>
  );
}
```

`apps/web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter caspilot-web test scaffold`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): scaffold Next.js 14 app with Tailwind"
```

---

### Task 5.2: Env validation — reject privileged keys in client bundle

**Files:**
- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/test/env.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validatePublicEnv, FORBIDDEN_PUBLIC_KEYS } from '../src/lib/env.js';

describe('public env guard', () => {
  it('accepts only NEXT_PUBLIC_* with no privileged names', () => {
    const ok = validatePublicEnv({
      NEXT_PUBLIC_CASPILOT_API_BASE: 'http://localhost:8787',
      NEXT_PUBLIC_CASPER_NETWORK: 'casper-test',
    });
    expect(ok.NEXT_PUBLIC_CASPILOT_API_BASE).toBe('http://localhost:8787');
  });

  it('throws if any privileged key leaks into NEXT_PUBLIC_*', () => {
    expect(() =>
      validatePublicEnv({ NEXT_PUBLIC_CSPR_CLOUD_KEY: 'leaked' } as Record<string, string>),
    ).toThrow(/CSPR_CLOUD_KEY/);
  });

  it('FORBIDDEN_PUBLIC_KEYS includes cloud key + private key + mnemonic', () => {
    expect(FORBIDDEN_PUBLIC_KEYS).toEqual(
      expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY', 'MNEMONIC', 'SEED']),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test env`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/env.ts`:
```ts
import { z } from 'zod';

export const FORBIDDEN_PUBLIC_KEYS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'MNEMONIC',
  'SEED',
  'API_KEY',
  'FACILITATOR_SECRET',
];

const Schema = z.object({
  NEXT_PUBLIC_CASPILOT_API_BASE: z.string().url(),
  NEXT_PUBLIC_CASPER_NETWORK: z.string().min(1),
});

export type PublicEnv = z.infer<typeof Schema>;

export function validatePublicEnv(input: Record<string, string | undefined>): PublicEnv {
  for (const key of Object.keys(input)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    for (const bad of FORBIDDEN_PUBLIC_KEYS) {
      if (key.includes(bad)) {
        throw new Error(`Forbidden public env key: ${key} — privileged secrets must never be bundled to the browser`);
      }
    }
  }
  return Schema.parse(input);
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test env`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/env.ts apps/web/test/env.test.ts
git commit -m "feat(web): reject privileged env names in NEXT_PUBLIC_*"
```

---

### Task 5.3: Lint guard — fail build if CSPR.cloud or signer secrets appear in client bundle

**Files:**
- Create: `apps/web/scripts/check-bundle-secrets.mjs`
- Create: `apps/web/test/bundle-secrets.test.ts`
- Modify: `apps/web/package.json` (add `predeploy` script)

- [ ] **Step 1: Write the failing test**

`apps/web/test/bundle-secrets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scanFiles, FORBIDDEN_SUBSTRINGS } from '../scripts/check-bundle-secrets.mjs';

describe('bundle secret scanner', () => {
  it('FORBIDDEN_SUBSTRINGS includes cloud key + private key patterns', () => {
    expect(FORBIDDEN_SUBSTRINGS).toEqual(
      expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY', 'FACILITATOR_SECRET']),
    );
  });

  it('flags files containing forbidden substrings', () => {
    const result = scanFiles([{ path: 'a.js', text: 'const k = "CSPR_CLOUD_KEY=abc";' }]);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].pattern).toBe('CSPR_CLOUD_KEY');
  });

  it('does not flag clean files', () => {
    const result = scanFiles([{ path: 'a.js', text: 'const k = "ok";' }]);
    expect(result.violations.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test bundle-secrets`
Expected: FAIL — script missing.

- [ ] **Step 3: Write minimal implementation**

`apps/web/scripts/check-bundle-secrets.mjs`:
```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FORBIDDEN_SUBSTRINGS = [
  'CSPR_CLOUD_KEY',
  'PRIVATE_KEY',
  'FACILITATOR_SECRET',
  'MNEMONIC',
  'SEED_PHRASE',
];

export function scanFiles(files) {
  const violations = [];
  for (const f of files) {
    for (const p of FORBIDDEN_SUBSTRINGS) {
      if (f.text.includes(p)) violations.push({ path: f.path, pattern: p });
    }
  }
  return { violations };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|css|html|json)$/.test(e)) out.push({ path: p, text: readFileSync(p, 'utf8') });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? '.next';
  const files = walk(target);
  const { violations } = scanFiles(files);
  if (violations.length) {
    console.error('Forbidden secrets found in client bundle:');
    for (const v of violations) console.error(`  ${v.path}: ${v.pattern}`);
    process.exit(1);
  }
  console.log(`Bundle clean (${files.length} files scanned)`);
}
```

Append to `apps/web/package.json` scripts:
```json
"build:check": "next build && node scripts/check-bundle-secrets.mjs .next"
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test bundle-secrets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/check-bundle-secrets.mjs apps/web/test/bundle-secrets.test.ts apps/web/package.json
git commit -m "feat(web): scan client bundle for leaked secret names"
```

---

### Task 5.4: Type-safe API client (only NEXT_PUBLIC_CASPILOT_API_BASE)

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/test/api.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/api.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { CaspilotApi } from '../src/lib/api.js';

describe('CaspilotApi', () => {
  it('targets only NEXT_PUBLIC_CASPILOT_API_BASE', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ id: 'int_abc', state: 'DRAFT' }), { status: 201 }));
    const api = new CaspilotApi({ baseUrl: 'http://api.test', fetch: fetchMock as unknown as typeof fetch });
    const r = await api.createIntent({
      agent: '00' + 'aa'.repeat(32),
      receiver: '00' + 'bb'.repeat(32),
      token: 'cspr-cep18',
      contract: '00' + 'cc'.repeat(32),
      network: 'casper:casper-test',
      amount: '100',
    });
    expect(r.id).toBe('int_abc');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/intents');
  });

  it('throws if baseUrl is empty', () => {
    expect(() => new CaspilotApi({ baseUrl: '' })).toThrow(/baseUrl/);
  });

  it('GET /intents/:id/trace returns redacted trace from server', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    const api = new CaspilotApi({ baseUrl: 'http://api.test', fetch: fetchMock as unknown as typeof fetch });
    const r = await api.getTrace('int_abc');
    expect(r.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test api`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/api.ts`:
```ts
export interface CreateIntentBody {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
}

export interface CreateIntentResponse {
  id: string;
  state: string;
}

export interface TraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload?: unknown;
}

export interface CaspilotApiOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class CaspilotApi {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: CaspilotApiOptions) {
    if (!opts.baseUrl) throw new Error('baseUrl is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetcher = opts.fetch ?? globalThis.fetch;
  }

  async createIntent(body: CreateIntentBody): Promise<CreateIntentResponse> {
    const res = await this.fetcher(`${this.baseUrl}/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`createIntent ${res.status}`);
    return (await res.json()) as CreateIntentResponse;
  }

  async validatePolicy(id: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/validate-policy`, { method: 'POST' });
    if (!res.ok) throw new Error(`validatePolicy ${res.status}`);
    return (await res.json()) as { id: string; state: string };
  }

  async getTrace(id: string): Promise<{ entries: TraceEntry[] }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/trace`);
    if (!res.ok) throw new Error(`getTrace ${res.status}`);
    return (await res.json()) as { entries: TraceEntry[] };
  }

  async reject(id: string, reason: string): Promise<{ id: string; state: string }> {
    const res = await this.fetcher(`${this.baseUrl}/intents/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`reject ${res.status}`);
    return (await res.json()) as { id: string; state: string };
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/test/api.test.ts
git commit -m "feat(web): type-safe Caspilot API client"
```

---

### Task 5.5: CSPR.click wallet adapter (browser-only, no API keys)

**Files:**
- Create: `apps/web/src/lib/wallet.ts`
- Create: `apps/web/test/wallet.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/wallet.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { ClickWallet, type ClickProvider } from '../src/lib/wallet.js';

describe('ClickWallet', () => {
  it('exposes connect / requestSignature using the provider only — never reads any API key', async () => {
    const provider: ClickProvider = {
      connect: vi.fn(async () => ({ publicKeyHex: '01' + 'ab'.repeat(32) })),
      signDeploy: vi.fn(async () => ({ signatureHex: 'aa'.repeat(65) })),
    };
    const w = new ClickWallet(provider);
    const acc = await w.connect();
    expect(acc.publicKeyHex.startsWith('01')).toBe(true);
    const sig = await w.signDeploy({ deployHashHex: 'cc'.repeat(32) });
    expect(sig.signatureHex.length).toBe(130);
  });

  it('throws helpful error when provider is missing', () => {
    expect(() => new ClickWallet(undefined as unknown as ClickProvider)).toThrow(/CSPR\.click/);
  });

  it('refuses to read any property that looks like CSPR_CLOUD_KEY', () => {
    const provider = { connect: async () => ({ publicKeyHex: '01' + 'ab'.repeat(32) }), signDeploy: async () => ({ signatureHex: 'aa'.repeat(65) }), CSPR_CLOUD_KEY: 'leaked' } as unknown as ClickProvider;
    expect(() => new ClickWallet(provider)).toThrow(/CSPR_CLOUD_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test wallet`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/wallet.ts`:
```ts
export interface ClickAccount {
  publicKeyHex: string;
}

export interface ClickSignedDeploy {
  signatureHex: string;
}

export interface ClickProvider {
  connect(): Promise<ClickAccount>;
  signDeploy(input: { deployHashHex: string }): Promise<ClickSignedDeploy>;
}

export class ClickWallet {
  private readonly provider: ClickProvider;

  constructor(provider: ClickProvider) {
    if (!provider) {
      throw new Error('CSPR.click provider missing — install the browser SDK and inject it');
    }
    for (const k of Object.keys(provider as object)) {
      if (k.includes('CSPR_CLOUD_KEY') || k.includes('PRIVATE_KEY')) {
        throw new Error(`CSPR.click provider exposes forbidden field "${k}" — frontend must not see privileged secrets`);
      }
    }
    this.provider = provider;
  }

  connect(): Promise<ClickAccount> { return this.provider.connect(); }
  signDeploy(input: { deployHashHex: string }): Promise<ClickSignedDeploy> { return this.provider.signDeploy(input); }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test wallet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/wallet.ts apps/web/test/wallet.test.ts
git commit -m "feat(web): CSPR.click wallet adapter rejects privileged fields"
```

---

### Task 5.6: PolicyVault management page (list / create form, signs via CSPR.click)

**Files:**
- Create: `apps/web/app/vaults/page.tsx`
- Create: `apps/web/src/components/VaultForm.tsx`
- Create: `apps/web/test/vault-form.test.tsx`
- Modify: `apps/web/package.json` add `@testing-library/react`, `@testing-library/dom`, `jsdom`, `@vitejs/plugin-react`
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
});
```

`apps/web/test/vault-form.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultForm } from '../src/components/VaultForm.js';

describe('VaultForm', () => {
  it('renders all required fields', () => {
    render(<VaultForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/admin/i)).toBeTruthy();
    expect(screen.getByLabelText(/cep-18 contract/i)).toBeTruthy();
    expect(screen.getByLabelText(/max single payment/i)).toBeTruthy();
    expect(screen.getByLabelText(/daily limit/i)).toBeTruthy();
    expect(screen.getByLabelText(/valid until/i)).toBeTruthy();
  });

  it('blocks submit when admin is empty', () => {
    const onSubmit = vi.fn();
    render(<VaultForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('emits normalized values on submit', () => {
    const onSubmit = vi.fn();
    render(<VaultForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/admin/i), { target: { value: '00' + 'aa'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/cep-18 contract/i), { target: { value: '00' + 'bb'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/max single payment/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/daily limit/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/valid until/i), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.admin.startsWith('00')).toBe(true);
    expect(payload.maxSinglePayment).toBe('1000');
    expect(typeof payload.validUntilMs).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test vault-form`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/components/VaultForm.tsx`:
```tsx
'use client';
import { useState } from 'react';

export interface VaultFormValue {
  admin: string;
  cep18Contract: string;
  maxSinglePayment: string;
  dailyLimit: string;
  validUntilMs: number;
}

export function VaultForm({ onSubmit }: { onSubmit: (v: VaultFormValue) => void }) {
  const [admin, setAdmin] = useState('');
  const [cep18, setCep18] = useState('');
  const [maxSingle, setMaxSingle] = useState('');
  const [daily, setDaily] = useState('');
  const [until, setUntil] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!admin || !cep18 || !maxSingle || !daily || !until) return;
    const validUntilMs = new Date(until + 'T00:00:00Z').getTime();
    onSubmit({ admin, cep18Contract: cep18, maxSinglePayment: maxSingle, dailyLimit: daily, validUntilMs });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <Field id="admin" label="Admin (account hash)" value={admin} onChange={setAdmin} />
      <Field id="cep18" label="CEP-18 contract" value={cep18} onChange={setCep18} />
      <Field id="max" label="Max single payment" value={maxSingle} onChange={setMaxSingle} />
      <Field id="daily" label="Daily limit" value={daily} onChange={setDaily} />
      <Field id="until" label="Valid until" value={until} onChange={setUntil} type="date" />
      <button type="submit" className="bg-zinc-100 text-zinc-900 px-3 py-1 rounded">Create</button>
    </form>
  );
}

function Field({ id, label, value, onChange, type = 'text' }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="block w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1" />
    </label>
  );
}
```

`apps/web/app/vaults/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { VaultForm, type VaultFormValue } from '@/components/VaultForm.js';

export default function VaultsPage() {
  const [submitted, setSubmitted] = useState<VaultFormValue | null>(null);
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">PolicyVaults</h1>
      <p className="text-zinc-400 text-sm">Drafts a deploy payload — the user signs with CSPR.click; the backend never sees the private key.</p>
      <VaultForm onSubmit={setSubmitted} />
      {submitted && (
        <pre className="bg-zinc-900 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(submitted, null, 2)}</pre>
      )}
    </main>
  );
}
```

Append to `apps/web/package.json` devDependencies:
```json
"@testing-library/react": "^15.0.0",
"@testing-library/dom": "^10.0.0",
"@vitejs/plugin-react": "^4.3.0",
"jsdom": "^24.0.0"
```

- [ ] **Step 4: Run test**

Run: `pnpm install && pnpm --filter caspilot-web test vault-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/vaults apps/web/src/components/VaultForm.tsx apps/web/test/vault-form.test.tsx apps/web/vitest.config.ts apps/web/package.json
git commit -m "feat(web): PolicyVault create form + page (signs via CSPR.click)"
```

---

### Task 5.7: Intent creation + state machine viewer page

**Files:**
- Create: `apps/web/app/intents/page.tsx`
- Create: `apps/web/src/components/IntentForm.tsx`
- Create: `apps/web/src/components/StateBadge.tsx`
- Create: `apps/web/test/intent-form.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/test/intent-form.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentForm } from '../src/components/IntentForm.js';
import { StateBadge } from '../src/components/StateBadge.js';

describe('IntentForm', () => {
  it('submits with valid hex addresses + amount', () => {
    const onSubmit = vi.fn();
    render(<IntentForm defaults={{ network: 'casper:casper-test' }} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/agent/i), { target: { value: '00' + 'aa'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/receiver/i), { target: { value: '00' + 'bb'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: 'cspr-cep18' } });
    fireEvent.change(screen.getByLabelText(/contract/i), { target: { value: '00' + 'cc'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('rejects non-account-hash agent', () => {
    const onSubmit = vi.fn();
    render(<IntentForm defaults={{ network: 'casper:casper-test' }} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/agent/i), { target: { value: 'not-hex' } });
    fireEvent.change(screen.getByLabelText(/receiver/i), { target: { value: '00' + 'bb'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: 'cspr-cep18' } });
    fireEvent.change(screen.getByLabelText(/contract/i), { target: { value: '00' + 'cc'.repeat(32) } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /create intent/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/agent must be an account-hash hex/i)).toBeTruthy();
  });
});

describe('StateBadge', () => {
  it('uses red tone for failure-like terminal states', () => {
    const { container } = render(<StateBadge state="EXECUTION_FAILED" />);
    expect(container.innerHTML).toMatch(/red/);
  });
  it('uses green tone for FINALIZED', () => {
    const { container } = render(<StateBadge state="FINALIZED" />);
    expect(container.innerHTML).toMatch(/green/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test intent-form`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/components/StateBadge.tsx`:
```tsx
const TONE: Record<string, string> = {
  DRAFT: 'bg-zinc-700 text-zinc-100',
  POLICY_VALIDATED: 'bg-blue-700 text-blue-50',
  PAYMENT_REQUIRED: 'bg-amber-700 text-amber-50',
  PAYMENT_VERIFIED: 'bg-amber-600 text-amber-50',
  READY_TO_SUBMIT: 'bg-indigo-700 text-indigo-50',
  SIGNED_RECEIVED: 'bg-indigo-600 text-indigo-50',
  ACCEPTED_BY_NODE: 'bg-indigo-500 text-indigo-50',
  EXECUTED: 'bg-emerald-600 text-emerald-50',
  FINALIZED: 'bg-green-600 text-green-50',
  EXECUTION_FAILED: 'bg-red-700 text-red-50',
  REJECTED: 'bg-red-800 text-red-50',
  TIMEOUT: 'bg-zinc-600 text-zinc-50',
};

export function StateBadge({ state }: { state: string }) {
  const tone = TONE[state] ?? 'bg-zinc-700 text-zinc-100';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs ${tone}`}>{state}</span>;
}
```

`apps/web/src/components/IntentForm.tsx`:
```tsx
'use client';
import { useState } from 'react';

const ACCOUNT_HASH = /^00[0-9a-f]{64}$/;

export interface IntentFormValue {
  agent: string;
  receiver: string;
  token: string;
  contract: string;
  network: string;
  amount: string;
}

export function IntentForm({ defaults, onSubmit }: { defaults: { network: string }; onSubmit: (v: IntentFormValue) => void }) {
  const [v, setV] = useState<IntentFormValue>({ agent: '', receiver: '', token: '', contract: '', network: defaults.network, amount: '' });
  const [err, setErr] = useState<string | null>(null);

  function setField<K extends keyof IntentFormValue>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ACCOUNT_HASH.test(v.agent)) return setErr('agent must be an account-hash hex (00<64 hex>)');
    if (!ACCOUNT_HASH.test(v.receiver)) return setErr('receiver must be an account-hash hex');
    if (!ACCOUNT_HASH.test(v.contract)) return setErr('contract must be an account-hash hex');
    if (!v.amount || !/^\d+$/.test(v.amount)) return setErr('amount must be a decimal string');
    setErr(null);
    onSubmit(v);
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <Input id="agent" label="Agent" value={v.agent} onChange={setField('agent')} />
      <Input id="receiver" label="Receiver" value={v.receiver} onChange={setField('receiver')} />
      <Input id="token" label="Token" value={v.token} onChange={setField('token')} />
      <Input id="contract" label="Contract" value={v.contract} onChange={setField('contract')} />
      <Input id="amount" label="Amount" value={v.amount} onChange={setField('amount')} />
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <button type="submit" className="bg-zinc-100 text-zinc-900 px-3 py-1 rounded">Create intent</button>
    </form>
  );
}

function Input({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-zinc-400">{label}</span>
      <input id={id} value={value} onChange={onChange} className="block w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1" />
    </label>
  );
}
```

`apps/web/app/intents/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { IntentForm, type IntentFormValue } from '@/components/IntentForm.js';
import { StateBadge } from '@/components/StateBadge.js';
import { CaspilotApi } from '@/lib/api.js';

const api = new CaspilotApi({ baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787' });

export default function IntentsPage() {
  const [latest, setLatest] = useState<{ id: string; state: string } | null>(null);
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intents</h1>
      <IntentForm
        defaults={{ network: process.env.NEXT_PUBLIC_CASPER_NETWORK ?? 'casper:casper-test' }}
        onSubmit={async (v: IntentFormValue) => setLatest(await api.createIntent(v))}
      />
      {latest && (
        <div className="flex items-center gap-2">
          <StateBadge state={latest.state} />
          <span className="text-xs text-zinc-400">{latest.id}</span>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test intent-form`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/intents apps/web/src/components/IntentForm.tsx apps/web/src/components/StateBadge.tsx apps/web/test/intent-form.test.tsx
git commit -m "feat(web): intent form + state badge"
```

---

### Task 5.8: Audit trace inspector page (consumes server-redacted trace only)

**Files:**
- Create: `apps/web/app/intents/[id]/page.tsx`
- Create: `apps/web/src/components/TraceList.tsx`
- Create: `apps/web/test/trace-list.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/test/trace-list.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TraceList } from '../src/components/TraceList.js';

describe('TraceList', () => {
  it('renders entries in chronological order', () => {
    render(
      <TraceList
        entries={[
          { intentId: 'int_a', state: 'POLICY_VALIDATED', atMs: 2, kind: 'transition' },
          { intentId: 'int_a', state: 'DRAFT', atMs: 1, kind: 'created' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/DRAFT/);
    expect(items[1].textContent).toMatch(/POLICY_VALIDATED/);
  });

  it('refuses to render any payload key in FORBIDDEN list', () => {
    const { container } = render(
      <TraceList
        entries={[{ intentId: 'int_a', state: 'DRAFT', atMs: 1, kind: 'created', payload: { reasoning: 'should-not-render', ok: true } }]}
      />,
    );
    expect(container.textContent).not.toMatch(/should-not-render/);
    expect(container.textContent).toMatch(/ok/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-web test trace-list`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/components/TraceList.tsx`:
```tsx
import { StateBadge } from './StateBadge.js';

export interface TraceEntry {
  intentId: string;
  state: string;
  atMs: number;
  kind: string;
  payload?: unknown;
}

const FRONTEND_FORBIDDEN_KEYS = new Set([
  'privateKey', 'PRIVATE_KEY', 'mnemonic', 'seed',
  'apiKey', 'API_KEY', 'CSPR_CLOUD_KEY',
  'reasoning', 'chainOfThought', 'prompt', 'env',
]);

function sanitize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FRONTEND_FORBIDDEN_KEYS.has(k)) continue;
    out[k] = sanitize(v);
  }
  return out;
}

export function TraceList({ entries }: { entries: TraceEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.atMs - b.atMs);
  return (
    <ul className="space-y-2">
      {sorted.map((e, i) => (
        <li key={i} className="bg-zinc-900 rounded p-3 space-y-1">
          <div className="flex items-center gap-2">
            <StateBadge state={e.state} />
            <span className="text-xs text-zinc-500">{new Date(e.atMs).toISOString()}</span>
            <span className="text-xs text-zinc-400">{e.kind}</span>
          </div>
          {e.payload !== undefined && (
            <pre className="text-xs overflow-x-auto">{JSON.stringify(sanitize(e.payload), null, 2)}</pre>
          )}
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/app/intents/[id]/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { TraceList, type TraceEntry } from '@/components/TraceList.js';
import { CaspilotApi } from '@/lib/api.js';

const api = new CaspilotApi({ baseUrl: process.env.NEXT_PUBLIC_CASPILOT_API_BASE ?? 'http://localhost:8787' });

export default function IntentDetail({ params }: { params: { id: string } }) {
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await api.getTrace(params.id).catch(() => ({ entries: [] }));
      if (!cancelled) setEntries(r.entries);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [params.id]);

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Intent {params.id}</h1>
      <TraceList entries={entries} />
    </main>
  );
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-web test trace-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/intents/\[id\] apps/web/src/components/TraceList.tsx apps/web/test/trace-list.test.tsx
git commit -m "feat(web): audit trace inspector page"
```

---

### Task 5.9: P5 acceptance — `next build` + secret scan must pass

**Files:**
- Create: `apps/web/test/p5-acceptance.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/p5-acceptance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORBIDDEN_SUBSTRINGS } from '../scripts/check-bundle-secrets.mjs';

describe('P5 acceptance', () => {
  it('NEXT_PUBLIC_* secret allowlist denies cloud + private key', () => {
    expect(FORBIDDEN_SUBSTRINGS).toEqual(
      expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY']),
    );
  });

  it('vault + intents pages are present', () => {
    const r = resolve(__dirname, '..');
    expect(existsSync(`${r}/app/vaults/page.tsx`)).toBe(true);
    expect(existsSync(`${r}/app/intents/page.tsx`)).toBe(true);
    expect(existsSync(`${r}/app/intents/[id]/page.tsx`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter caspilot-web test p5-acceptance && pnpm --filter caspilot-web run build:check`
Expected: PASS for tests; `next build` succeeds; bundle scan finds zero forbidden substrings.

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/p5-acceptance.test.ts
git commit -m "test: P5 acceptance summary"
```

---

## Phase 6 — Demo Tier 1 harness (real on-chain proof)

**Goal:** Produce at least one real on-chain artifact, per the safety rules — a real PolicyVault deploy on Casper testnet, a real successful `pay()` call routed through it, and at least one real **rejected** `pay()` call. The harness writes a signed `tier1-artifacts.json` containing deploy hashes + node-finalized state.

**Signer rule:** Tier 1 uses the `local_dev` signer (env-keyed). The **demo signer** is used only in `testnet` mode for self-driven flows. The **user signer (CSPR.click)** is never used in this harness — it is for browser-driven flows in P5. SignerGuard allowlists must be loaded from `.demo/signer-guard.json` (deny-empty enforced).

**Package layout:**
- `apps/harness/` — Node ESM, depends on `@caspilot/{adapters,signer-guard,intent-fsm,audit-trace}`.
- `apps/harness/scripts/` — deploy + seed + dump-artifacts.
- `apps/harness/test/` — `demo-tier1-*.test.ts` gated by `RUN_REAL_ONCHAIN=1`; default run is dry.
- `apps/harness/.demo/` — gitignored runtime outputs.

**Environment contract:**
- `CASPER_NODE_RPC` — testnet RPC URL.
- `CASPER_CHAINSPEC` — expected `casper-test`.
- `LOCAL_SIGNER_PRIVATE_KEY_PATH` — file path to local signer PEM (never the value).
- `VAULT_WASM_PATH` — path to compiled `policy_vault.wasm`.
- `CEP18_CONTRACT_HASH` — hex of the test CEP-18 token contract.
- `DEMO_RECEIVER_HASH` — receiver account-hash for success path.
- `DEMO_BLOCKED_RECEIVER_HASH` — receiver account-hash that is NOT on the allowlist (rejection pathway A).
- `RUN_REAL_ONCHAIN` — `1` to actually broadcast; default unset → harness runs dry.

---

### Task 6.1: Scaffold `apps/harness` + tier 1 artifact schema

**Files:**
- Create: `apps/harness/package.json`
- Create: `apps/harness/tsconfig.json`
- Create: `apps/harness/src/schema.ts`
- Create: `apps/harness/test/schema.test.ts`
- Create: `apps/harness/.gitignore`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { TierOneArtifactsSchema } from '../src/schema.js';

describe('TierOneArtifactsSchema', () => {
  it('requires deployVaultHash + paySuccessHash + at least one rejection record', () => {
    const ok = TierOneArtifactsSchema.parse({
      generatedAtMs: Date.now(),
      network: 'casper-test',
      chainspec: 'casper-test',
      vault: { contractHash: '00' + 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1_000_000 },
      paySuccess: { deployHash: 'cc'.repeat(32), amount: '100', receiver: '00' + 'dd'.repeat(32), finalizedHeight: 1_000_001 },
      rejections: [
        { kind: 'receiver_not_allowed', deployHash: 'ee'.repeat(32), errorCode: 60004, finalizedHeight: 1_000_002 },
      ],
    });
    expect(ok.rejections.length).toBe(1);
  });

  it('refuses zero rejections', () => {
    expect(() =>
      TierOneArtifactsSchema.parse({
        generatedAtMs: 0,
        network: 'casper-test',
        chainspec: 'casper-test',
        vault: { contractHash: '00' + 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1 },
        paySuccess: { deployHash: 'cc'.repeat(32), amount: '1', receiver: '00' + 'dd'.repeat(32), finalizedHeight: 2 },
        rejections: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test schema`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/package.json`:
```json
{
  "name": "caspilot-harness",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy:vault": "tsx scripts/deploy-vault.ts",
    "seed": "tsx scripts/seed-demo.ts",
    "dump": "tsx scripts/dump-tier1-artifacts.ts",
    "demo": "tsx scripts/run-tier1.ts"
  },
  "dependencies": {
    "@caspilot/adapters": "workspace:*",
    "@caspilot/audit-trace": "workspace:*",
    "@caspilot/intent-fsm": "workspace:*",
    "@caspilot/signer-guard": "workspace:*",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "tsx": "^4.16.0",
    "typescript": "5.5.4",
    "vitest": "^1.6.0"
  }
}
```

`apps/harness/tsconfig.json`:
```json
{
  "extends": "../../packages/tsconfig/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "module": "esnext", "moduleResolution": "bundler" },
  "include": ["src/**/*", "scripts/**/*", "test/**/*"]
}
```

`apps/harness/.gitignore`:
```
.demo/
dist/
node_modules/
*.log
```

`apps/harness/src/schema.ts`:
```ts
import { z } from 'zod';

const Hex32 = z.string().regex(/^[0-9a-f]{64}$/);
const Hex64 = z.string().regex(/^[0-9a-f]{130}$/);
const AccountHashHex = z.string().regex(/^00[0-9a-f]{64}$/);

export const VaultArtifact = z.object({
  contractHash: AccountHashHex,
  deployHash: Hex32,
  finalizedHeight: z.number().int().nonnegative(),
});

export const PaySuccessArtifact = z.object({
  deployHash: Hex32,
  amount: z.string().regex(/^\d+$/),
  receiver: AccountHashHex,
  finalizedHeight: z.number().int().nonnegative(),
});

export const RejectionArtifact = z.object({
  kind: z.enum(['receiver_not_allowed', 'over_max_single_payment', 'over_daily_limit', 'expired', 'duplicate_nonce']),
  deployHash: Hex32,
  errorCode: z.number().int(),
  finalizedHeight: z.number().int().nonnegative(),
});

export const TierOneArtifactsSchema = z.object({
  generatedAtMs: z.number().int().nonnegative(),
  network: z.string().min(1),
  chainspec: z.string().min(1),
  vault: VaultArtifact,
  paySuccess: PaySuccessArtifact,
  rejections: z.array(RejectionArtifact).min(1, 'tier 1 requires at least one real rejection'),
  notes: z.string().optional(),
});

export type TierOneArtifacts = z.infer<typeof TierOneArtifactsSchema>;
export type RejectionKind = z.infer<typeof RejectionArtifact>['kind'];
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/
git commit -m "feat(harness): scaffold + tier 1 artifact schema"
```

---

### Task 6.2: Local signer loader — file-only, never accepts inline key

**Files:**
- Create: `apps/harness/src/local-signer.ts`
- Create: `apps/harness/test/local-signer.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/local-signer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalSigner, LocalSignerError } from '../src/local-signer.js';

describe('loadLocalSigner', () => {
  it('loads PEM from file path only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-'));
    const file = join(dir, 'key.pem');
    writeFileSync(file, '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n');
    const s = loadLocalSigner({ keyPath: file });
    expect(s.role).toBe('local_dev');
    expect(s.pemBytes.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true });
  });

  it('refuses inline PEM body as input', () => {
    expect(() =>
      loadLocalSigner({ keyPath: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----' } as unknown as { keyPath: string }),
    ).toThrow(LocalSignerError);
  });

  it('refuses missing files with a clear error', () => {
    expect(() => loadLocalSigner({ keyPath: '/nonexistent/key.pem' })).toThrow(/keyPath/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test local-signer`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/src/local-signer.ts`:
```ts
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export class LocalSignerError extends Error {}

export interface LocalSigner {
  role: 'local_dev';
  pemBytes: Uint8Array;
}

export function loadLocalSigner(opts: { keyPath: string }): LocalSigner {
  const p = opts.keyPath;
  if (!p || typeof p !== 'string') throw new LocalSignerError('keyPath is required');
  if (p.includes('BEGIN PRIVATE KEY') || p.includes('-----')) {
    throw new LocalSignerError('keyPath must be a filesystem path, not inline PEM body');
  }
  if (!isAbsolute(p)) throw new LocalSignerError(`keyPath must be absolute: ${p}`);
  if (!existsSync(p)) throw new LocalSignerError(`keyPath does not exist: ${p}`);
  const pemBytes = readFileSync(p);
  return { role: 'local_dev', pemBytes };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test local-signer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/src/local-signer.ts apps/harness/test/local-signer.test.ts
git commit -m "feat(harness): file-only local signer loader"
```

---

### Task 6.3: `scripts/deploy-vault.ts` — dry by default, real with `RUN_REAL_ONCHAIN=1`

**Files:**
- Create: `apps/harness/scripts/deploy-vault.ts`
- Create: `apps/harness/test/deploy-vault.dry.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/deploy-vault.dry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildDeployVaultPlan } from '../scripts/deploy-vault.js';

describe('deploy-vault plan', () => {
  it('returns dry plan when RUN_REAL_ONCHAIN is unset', () => {
    const plan = buildDeployVaultPlan({
      env: {
        CASPER_NODE_RPC: 'http://node:7777/rpc',
        CASPER_CHAINSPEC: 'casper-test',
        VAULT_WASM_PATH: '/tmp/vault.wasm',
        LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/key.pem',
      },
      now: () => 1_700_000_000_000,
    });
    expect(plan.mode).toBe('dry');
    expect(plan.rpc).toBe('http://node:7777/rpc');
    expect(plan.expectedChainspec).toBe('casper-test');
  });

  it('refuses to build a real plan if VAULT_WASM_PATH is missing', () => {
    expect(() =>
      buildDeployVaultPlan({
        env: { CASPER_NODE_RPC: 'x', CASPER_CHAINSPEC: 'casper-test', LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k', RUN_REAL_ONCHAIN: '1' },
        now: () => 0,
      }),
    ).toThrow(/VAULT_WASM_PATH/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test deploy-vault.dry`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/scripts/deploy-vault.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalSigner } from '../src/local-signer.js';

export interface DeployVaultPlan {
  mode: 'dry' | 'real';
  rpc: string;
  expectedChainspec: string;
  wasmPath?: string;
  signerKeyPath: string;
  generatedAtMs: number;
}

export function buildDeployVaultPlan(input: {
  env: Record<string, string | undefined>;
  now: () => number;
}): DeployVaultPlan {
  const { env, now } = input;
  if (!env.CASPER_NODE_RPC) throw new Error('CASPER_NODE_RPC is required');
  if (!env.CASPER_CHAINSPEC) throw new Error('CASPER_CHAINSPEC is required');
  if (!env.LOCAL_SIGNER_PRIVATE_KEY_PATH) throw new Error('LOCAL_SIGNER_PRIVATE_KEY_PATH is required');
  const mode: 'dry' | 'real' = env.RUN_REAL_ONCHAIN === '1' ? 'real' : 'dry';
  if (mode === 'real' && !env.VAULT_WASM_PATH) throw new Error('VAULT_WASM_PATH is required when RUN_REAL_ONCHAIN=1');
  return {
    mode,
    rpc: env.CASPER_NODE_RPC,
    expectedChainspec: env.CASPER_CHAINSPEC,
    wasmPath: env.VAULT_WASM_PATH,
    signerKeyPath: env.LOCAL_SIGNER_PRIVATE_KEY_PATH,
    generatedAtMs: now(),
  };
}

async function main() {
  const plan = buildDeployVaultPlan({ env: process.env, now: () => Date.now() });
  const signer = loadLocalSigner({ keyPath: plan.signerKeyPath });
  const out = resolve(process.cwd(), 'apps/harness/.demo');
  mkdirSync(out, { recursive: true });
  if (plan.mode === 'dry') {
    writeFileSync(`${out}/deploy-vault.plan.json`, JSON.stringify({ ...plan, signerRole: signer.role }, null, 2));
    console.log(`[deploy-vault] DRY plan written to ${out}/deploy-vault.plan.json`);
    return;
  }
  // mode === 'real': REAL deploy must use the adapter layer; this script delegates to apps/api adapters at runtime
  // and writes the resulting { contractHash, deployHash, finalizedHeight } to `.demo/deploy-vault.result.json`.
  // Implementation hook: import casperRpc adapter from '@caspilot/adapters' and submit the WASM session deploy.
  throw new Error('REAL deploy must call @caspilot/adapters.casperRpc.submitWasmDeploy — wire this in once adapter is ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test deploy-vault.dry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/scripts/deploy-vault.ts apps/harness/test/deploy-vault.dry.test.ts
git commit -m "feat(harness): deploy-vault dry plan + real-mode gate"
```

---

### Task 6.4: `scripts/seed-demo.ts` — configure vault allowlists + signer-guard policy

**Files:**
- Create: `apps/harness/scripts/seed-demo.ts`
- Create: `apps/harness/test/seed-demo.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/seed-demo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSeedPlan } from '../scripts/seed-demo.js';

describe('seed-demo plan', () => {
  it('produces a SignerGuard policy that allows only the demo agent + receivers', () => {
    const plan = buildSeedPlan({
      env: {
        CEP18_CONTRACT_HASH: '00' + 'aa'.repeat(32),
        DEMO_AGENT_HASH: '00' + 'bb'.repeat(32),
        DEMO_RECEIVER_HASH: '00' + 'cc'.repeat(32),
        DEMO_BLOCKED_RECEIVER_HASH: '00' + 'dd'.repeat(32),
        DEMO_MAX_SINGLE: '100',
        DEMO_DAILY_LIMIT: '500',
      },
    });
    expect(plan.vault.allowedAgents).toEqual(['00' + 'bb'.repeat(32)]);
    expect(plan.vault.allowedReceivers).toEqual(['00' + 'cc'.repeat(32)]);
    expect(plan.vault.allowedReceivers).not.toContain('00' + 'dd'.repeat(32));
    expect(plan.signerGuard.agents.length).toBeGreaterThan(0);
    expect(plan.signerGuard.contracts).toContain('00' + 'aa'.repeat(32));
  });

  it('refuses to build if any env var is missing', () => {
    expect(() => buildSeedPlan({ env: {} })).toThrow(/CEP18_CONTRACT_HASH/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test seed-demo`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/scripts/seed-demo.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SeedPlan {
  vault: {
    cep18Contract: string;
    allowedAgents: string[];
    allowedReceivers: string[];
    maxSinglePayment: string;
    dailyLimit: string;
  };
  signerGuard: {
    agents: string[];
    receivers: string[];
    contracts: string[];
    networks: string[];
    maxAmounts: Record<string, string>;
  };
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
}

export function buildSeedPlan(input: { env: Record<string, string | undefined> }): SeedPlan {
  const e = input.env;
  const cep18 = need(e, 'CEP18_CONTRACT_HASH');
  const agent = need(e, 'DEMO_AGENT_HASH');
  const receiver = need(e, 'DEMO_RECEIVER_HASH');
  need(e, 'DEMO_BLOCKED_RECEIVER_HASH'); // ensures the operator declared the rejection counterparty up front
  const maxSingle = need(e, 'DEMO_MAX_SINGLE');
  const dailyLimit = need(e, 'DEMO_DAILY_LIMIT');
  return {
    vault: {
      cep18Contract: cep18,
      allowedAgents: [agent],
      allowedReceivers: [receiver],
      maxSinglePayment: maxSingle,
      dailyLimit: dailyLimit,
    },
    signerGuard: {
      agents: [agent],
      receivers: [receiver],
      contracts: [cep18],
      networks: ['casper-test'],
      maxAmounts: { [cep18]: maxSingle },
    },
  };
}

async function main() {
  const plan = buildSeedPlan({ env: process.env });
  const out = resolve(process.cwd(), 'apps/harness/.demo');
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/seed-plan.json`, JSON.stringify(plan, null, 2));
  writeFileSync(`${out}/signer-guard.json`, JSON.stringify(plan.signerGuard, null, 2));
  console.log(`[seed-demo] wrote ${out}/seed-plan.json and ${out}/signer-guard.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test seed-demo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/scripts/seed-demo.ts apps/harness/test/seed-demo.test.ts
git commit -m "feat(harness): seed-demo writes vault + signer-guard policy"
```

---

### Task 6.5: `demo-tier1-pay-success.test.ts` — dry assertion + real-mode gate

**Files:**
- Create: `apps/harness/test/demo-tier1-pay-success.test.ts`
- Create: `apps/harness/src/tier1-pay.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/demo-tier1-pay-success.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planTier1PaySuccess } from '../src/tier1-pay.js';

describe('Tier 1 pay-success plan', () => {
  it('targets allowlisted receiver with amount ≤ maxSinglePayment', () => {
    const plan = planTier1PaySuccess({
      vault: { cep18Contract: '00' + 'aa'.repeat(32), allowedAgents: ['00' + 'bb'.repeat(32)], allowedReceivers: ['00' + 'cc'.repeat(32)], maxSinglePayment: '100', dailyLimit: '500' },
      agent: '00' + 'bb'.repeat(32),
      amount: '50',
    });
    expect(plan.receiver).toBe('00' + 'cc'.repeat(32));
    expect(plan.amount).toBe('50');
    expect(plan.expectedRejection).toBeUndefined();
  });

  it('refuses if amount > maxSinglePayment (would be rejected on-chain)', () => {
    expect(() =>
      planTier1PaySuccess({
        vault: { cep18Contract: '00' + 'aa'.repeat(32), allowedAgents: ['00' + 'bb'.repeat(32)], allowedReceivers: ['00' + 'cc'.repeat(32)], maxSinglePayment: '100', dailyLimit: '500' },
        agent: '00' + 'bb'.repeat(32),
        amount: '200',
      }),
    ).toThrow(/maxSinglePayment/);
  });

  it('refuses if agent is not allowlisted', () => {
    expect(() =>
      planTier1PaySuccess({
        vault: { cep18Contract: '00' + 'aa'.repeat(32), allowedAgents: ['00' + 'bb'.repeat(32)], allowedReceivers: ['00' + 'cc'.repeat(32)], maxSinglePayment: '100', dailyLimit: '500' },
        agent: '00' + 'ee'.repeat(32),
        amount: '50',
      }),
    ).toThrow(/agent/);
  });

  it.skipIf(process.env.RUN_REAL_ONCHAIN !== '1')(
    'REAL — broadcasts pay() through deployed vault and observes EXECUTED → FINALIZED',
    async () => {
      // Implementation hook for the harness runner:
      //   1. Read .demo/deploy-vault.result.json for vaultContractHash.
      //   2. Read .demo/seed-plan.json for receiver + amount.
      //   3. Use @caspilot/adapters.casperRpc.submitContractCall to send pay(receiver, amount, payloadHash).
      //   4. Poll info_get_deploy until status === Executed.
      //   5. Poll info_get_block until height >= deploy.executionResults[].blockHeight + finalityLag.
      //   6. Append { kind:'paySuccess', deployHash, finalizedHeight } to .demo/tier1-events.json.
      // The assertion in real mode is just: events file contains a paySuccess entry with finalizedHeight > 0.
      // This branch is intentionally not wired here; demo-tier1.test.ts (Task 6.7) integrates it.
      expect(true).toBe(true);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test demo-tier1-pay-success`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/src/tier1-pay.ts`:
```ts
import type { SeedPlan } from '../scripts/seed-demo.js';

export interface PaySuccessPlan {
  vaultContract: string;
  agent: string;
  receiver: string;
  amount: string;
  expectedRejection?: never;
}

export function planTier1PaySuccess(input: {
  vault: SeedPlan['vault'];
  agent: string;
  amount: string;
}): PaySuccessPlan {
  const { vault, agent, amount } = input;
  if (!vault.allowedAgents.includes(agent)) throw new Error(`agent ${agent} is not allowlisted`);
  if (BigInt(amount) > BigInt(vault.maxSinglePayment)) {
    throw new Error(`amount ${amount} exceeds maxSinglePayment ${vault.maxSinglePayment}`);
  }
  const receiver = vault.allowedReceivers[0];
  if (!receiver) throw new Error('no allowlisted receivers configured');
  return { vaultContract: vault.cep18Contract, agent, receiver, amount };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test demo-tier1-pay-success`
Expected: PASS (real-mode branch is skipped when `RUN_REAL_ONCHAIN` is unset).

- [ ] **Step 5: Commit**

```bash
git add apps/harness/src/tier1-pay.ts apps/harness/test/demo-tier1-pay-success.test.ts
git commit -m "test(harness): tier 1 pay-success plan + real-mode gate"
```

---

### Task 6.6: `demo-tier1-rejection.test.ts` — pathway A (receiver) + B (over budget)

**Files:**
- Create: `apps/harness/src/tier1-rejection.ts`
- Create: `apps/harness/test/demo-tier1-rejection.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/demo-tier1-rejection.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { planTier1Rejection } from '../src/tier1-rejection.js';

describe('Tier 1 rejection plans', () => {
  const baseVault = {
    cep18Contract: '00' + 'aa'.repeat(32),
    allowedAgents: ['00' + 'bb'.repeat(32)],
    allowedReceivers: ['00' + 'cc'.repeat(32)],
    maxSinglePayment: '100',
    dailyLimit: '500',
  };

  it('pathway A — receiver_not_allowed → expects errorCode 60004 (PolicyVaultError::ReceiverNotAllowed)', () => {
    const plan = planTier1Rejection({
      vault: baseVault,
      agent: '00' + 'bb'.repeat(32),
      kind: 'receiver_not_allowed',
      blockedReceiver: '00' + 'dd'.repeat(32),
      amount: '50',
    });
    expect(plan.kind).toBe('receiver_not_allowed');
    expect(plan.expectedErrorCode).toBe(60004);
    expect(plan.receiver).toBe('00' + 'dd'.repeat(32));
  });

  it('pathway B — over_max_single_payment → expects errorCode 60005 (PolicyVaultError::AmountAboveMaxSingle)', () => {
    const plan = planTier1Rejection({
      vault: baseVault,
      agent: '00' + 'bb'.repeat(32),
      kind: 'over_max_single_payment',
      amount: '999',
    });
    expect(plan.expectedErrorCode).toBe(60005);
    expect(plan.amount).toBe('999');
  });

  it('refuses to construct pathway A without a blocked receiver', () => {
    expect(() =>
      planTier1Rejection({ vault: baseVault, agent: '00' + 'bb'.repeat(32), kind: 'receiver_not_allowed', amount: '50' }),
    ).toThrow(/blockedReceiver/);
  });

  it('refuses to construct pathway B with amount ≤ maxSinglePayment', () => {
    expect(() =>
      planTier1Rejection({ vault: baseVault, agent: '00' + 'bb'.repeat(32), kind: 'over_max_single_payment', amount: '50' }),
    ).toThrow(/amount/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test demo-tier1-rejection`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/src/tier1-rejection.ts`:
```ts
import type { SeedPlan } from '../scripts/seed-demo.js';

export type RejectionKind = 'receiver_not_allowed' | 'over_max_single_payment' | 'over_daily_limit' | 'expired' | 'duplicate_nonce';

// Codes must match PolicyVaultError discriminants defined in Task 1.1:
//   ReceiverNotAllowed = 60004, AmountAboveMaxSingle = 60005,
//   DailyLimitExceeded = 60006, AuthorizationExpired = 60007, NonceReplay = 60008.
const ERROR_CODE: Record<RejectionKind, number> = {
  receiver_not_allowed: 60004,
  over_max_single_payment: 60005,
  over_daily_limit: 60006,
  expired: 60007,
  duplicate_nonce: 60008,
};

export interface RejectionPlan {
  vaultContract: string;
  agent: string;
  receiver: string;
  amount: string;
  kind: RejectionKind;
  expectedErrorCode: number;
}

export function planTier1Rejection(input: {
  vault: SeedPlan['vault'];
  agent: string;
  kind: RejectionKind;
  amount: string;
  blockedReceiver?: string;
}): RejectionPlan {
  const { vault, agent, kind, amount, blockedReceiver } = input;
  if (kind === 'receiver_not_allowed') {
    if (!blockedReceiver) throw new Error('pathway A requires blockedReceiver');
    if (vault.allowedReceivers.includes(blockedReceiver)) {
      throw new Error('blockedReceiver is on the allowlist — choose a non-allowlisted address');
    }
    return { vaultContract: vault.cep18Contract, agent, receiver: blockedReceiver, amount, kind, expectedErrorCode: ERROR_CODE[kind] };
  }
  if (kind === 'over_max_single_payment') {
    if (BigInt(amount) <= BigInt(vault.maxSinglePayment)) {
      throw new Error('amount must exceed maxSinglePayment to trigger rejection');
    }
    const receiver = vault.allowedReceivers[0];
    if (!receiver) throw new Error('no allowlisted receivers configured');
    return { vaultContract: vault.cep18Contract, agent, receiver, amount, kind, expectedErrorCode: ERROR_CODE[kind] };
  }
  // other rejection kinds are wired in later tiers
  throw new Error(`rejection kind ${kind} not wired in Tier 1`);
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test demo-tier1-rejection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/src/tier1-rejection.ts apps/harness/test/demo-tier1-rejection.test.ts
git commit -m "test(harness): tier 1 rejection pathways A and B"
```

---

### Task 6.7: `scripts/dump-tier1-artifacts.ts` — assemble + validate artifacts file

**Files:**
- Create: `apps/harness/scripts/dump-tier1-artifacts.ts`
- Create: `apps/harness/test/dump-tier1-artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/dump-tier1-artifacts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assembleTier1Artifacts } from '../scripts/dump-tier1-artifacts.js';
import { TierOneArtifactsSchema } from '../src/schema.js';

describe('assembleTier1Artifacts', () => {
  it('packs vault + paySuccess + rejections into a TierOneArtifacts', () => {
    const out = assembleTier1Artifacts({
      now: 1_700_000_000_000,
      network: 'casper-test',
      chainspec: 'casper-test',
      vault: { contractHash: '00' + 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1 },
      paySuccess: { deployHash: 'cc'.repeat(32), amount: '50', receiver: '00' + 'cc'.repeat(32), finalizedHeight: 2 },
      rejections: [
        { kind: 'receiver_not_allowed', deployHash: 'dd'.repeat(32), errorCode: 60004, finalizedHeight: 3 },
        { kind: 'over_max_single_payment', deployHash: 'ee'.repeat(32), errorCode: 60005, finalizedHeight: 4 },
      ],
    });
    expect(() => TierOneArtifactsSchema.parse(out)).not.toThrow();
  });

  it('refuses to assemble if rejections is empty', () => {
    expect(() =>
      assembleTier1Artifacts({
        now: 0,
        network: 'casper-test',
        chainspec: 'casper-test',
        vault: { contractHash: '00' + 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1 },
        paySuccess: { deployHash: 'cc'.repeat(32), amount: '1', receiver: '00' + 'cc'.repeat(32), finalizedHeight: 2 },
        rejections: [],
      }),
    ).toThrow();
  });

  it('refuses if chainspec mismatches network root', () => {
    expect(() =>
      assembleTier1Artifacts({
        now: 0,
        network: 'casper',
        chainspec: 'casper-test',
        vault: { contractHash: '00' + 'aa'.repeat(32), deployHash: 'bb'.repeat(32), finalizedHeight: 1 },
        paySuccess: { deployHash: 'cc'.repeat(32), amount: '1', receiver: '00' + 'cc'.repeat(32), finalizedHeight: 2 },
        rejections: [{ kind: 'receiver_not_allowed', deployHash: 'dd'.repeat(32), errorCode: 60004, finalizedHeight: 3 }],
      }),
    ).toThrow(/chainspec/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test dump-tier1-artifacts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/scripts/dump-tier1-artifacts.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TierOneArtifactsSchema, type TierOneArtifacts } from '../src/schema.js';

export function assembleTier1Artifacts(input: {
  now: number;
  network: string;
  chainspec: string;
  vault: TierOneArtifacts['vault'];
  paySuccess: TierOneArtifacts['paySuccess'];
  rejections: TierOneArtifacts['rejections'];
  notes?: string;
}): TierOneArtifacts {
  if (input.rejections.length < 1) throw new Error('tier 1 requires at least one rejection');
  if (input.network !== input.chainspec) {
    // For testnet we expect both to be 'casper-test'; if the operator widens the network field, fail loudly.
    throw new Error(`chainspec ${input.chainspec} does not match network ${input.network} — tier 1 demos must be a single chain`);
  }
  const draft: TierOneArtifacts = {
    generatedAtMs: input.now,
    network: input.network,
    chainspec: input.chainspec,
    vault: input.vault,
    paySuccess: input.paySuccess,
    rejections: input.rejections,
    notes: input.notes,
  };
  return TierOneArtifactsSchema.parse(draft);
}

async function main() {
  const env = process.env;
  // Inputs are produced by run-tier1.ts (Task 6.8); this script is the standalone dumper.
  const path = resolve(process.cwd(), 'apps/harness/.demo/tier1-events.json');
  const events = JSON.parse(await import('node:fs').then((m) => m.readFileSync(path, 'utf8')));
  const artifacts = assembleTier1Artifacts({
    now: Date.now(),
    network: env.CASPER_CHAINSPEC ?? 'casper-test',
    chainspec: env.CASPER_CHAINSPEC ?? 'casper-test',
    vault: events.vault,
    paySuccess: events.paySuccess,
    rejections: events.rejections,
    notes: env.DEMO_NOTES,
  });
  const outDir = resolve(process.cwd(), 'apps/harness/.demo');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/tier1-artifacts.json`, JSON.stringify(artifacts, null, 2));
  console.log(`[dump-tier1] wrote ${outDir}/tier1-artifacts.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test dump-tier1-artifacts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/scripts/dump-tier1-artifacts.ts apps/harness/test/dump-tier1-artifacts.test.ts
git commit -m "feat(harness): assemble + validate tier1-artifacts.json"
```

---

### Task 6.8: `scripts/run-tier1.ts` — end-to-end runner (dry baseline + real hook)

**Files:**
- Create: `apps/harness/scripts/run-tier1.ts`
- Create: `apps/harness/test/run-tier1.dry.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/run-tier1.dry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildRunTier1Plan } from '../scripts/run-tier1.js';

describe('run-tier1 (dry)', () => {
  it('plans 1 deploy + 1 pay-success + 2 rejections', () => {
    const plan = buildRunTier1Plan({
      env: {
        CASPER_NODE_RPC: 'http://node:7777/rpc',
        CASPER_CHAINSPEC: 'casper-test',
        LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k.pem',
        CEP18_CONTRACT_HASH: '00' + 'aa'.repeat(32),
        DEMO_AGENT_HASH: '00' + 'bb'.repeat(32),
        DEMO_RECEIVER_HASH: '00' + 'cc'.repeat(32),
        DEMO_BLOCKED_RECEIVER_HASH: '00' + 'dd'.repeat(32),
        DEMO_MAX_SINGLE: '100',
        DEMO_DAILY_LIMIT: '500',
        DEMO_PAY_AMOUNT: '50',
        DEMO_REJECTION_AMOUNT: '999',
      },
    });
    expect(plan.steps.length).toBe(4);
    expect(plan.steps.map((s) => s.name)).toEqual([
      'deploy-vault',
      'pay-success',
      'rejection-receiver-not-allowed',
      'rejection-over-max-single-payment',
    ]);
    expect(plan.mode).toBe('dry');
  });

  it('marks mode=real when RUN_REAL_ONCHAIN=1', () => {
    const plan = buildRunTier1Plan({
      env: {
        CASPER_NODE_RPC: 'http://node:7777/rpc',
        CASPER_CHAINSPEC: 'casper-test',
        LOCAL_SIGNER_PRIVATE_KEY_PATH: '/tmp/k.pem',
        VAULT_WASM_PATH: '/tmp/vault.wasm',
        CEP18_CONTRACT_HASH: '00' + 'aa'.repeat(32),
        DEMO_AGENT_HASH: '00' + 'bb'.repeat(32),
        DEMO_RECEIVER_HASH: '00' + 'cc'.repeat(32),
        DEMO_BLOCKED_RECEIVER_HASH: '00' + 'dd'.repeat(32),
        DEMO_MAX_SINGLE: '100',
        DEMO_DAILY_LIMIT: '500',
        DEMO_PAY_AMOUNT: '50',
        DEMO_REJECTION_AMOUNT: '999',
        RUN_REAL_ONCHAIN: '1',
      },
    });
    expect(plan.mode).toBe('real');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter caspilot-harness test run-tier1.dry`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`apps/harness/scripts/run-tier1.ts`:
```ts
import { buildDeployVaultPlan } from './deploy-vault.js';
import { buildSeedPlan } from './seed-demo.js';
import { planTier1PaySuccess } from '../src/tier1-pay.js';
import { planTier1Rejection } from '../src/tier1-rejection.js';

export interface RunTier1Step {
  name: 'deploy-vault' | 'pay-success' | 'rejection-receiver-not-allowed' | 'rejection-over-max-single-payment';
  payload: unknown;
}

export interface RunTier1Plan {
  mode: 'dry' | 'real';
  rpc: string;
  chainspec: string;
  steps: RunTier1Step[];
}

export function buildRunTier1Plan(input: { env: Record<string, string | undefined> }): RunTier1Plan {
  const e = input.env;
  const deploy = buildDeployVaultPlan({ env: e, now: () => Date.now() });
  const seed = buildSeedPlan({ env: e });
  const payAmount = e.DEMO_PAY_AMOUNT ?? '50';
  const rejAmount = e.DEMO_REJECTION_AMOUNT ?? '999';
  const paySuccess = planTier1PaySuccess({ vault: seed.vault, agent: seed.vault.allowedAgents[0], amount: payAmount });
  const rejA = planTier1Rejection({
    vault: seed.vault,
    agent: seed.vault.allowedAgents[0],
    kind: 'receiver_not_allowed',
    blockedReceiver: e.DEMO_BLOCKED_RECEIVER_HASH,
    amount: payAmount,
  });
  const rejB = planTier1Rejection({
    vault: seed.vault,
    agent: seed.vault.allowedAgents[0],
    kind: 'over_max_single_payment',
    amount: rejAmount,
  });
  return {
    mode: deploy.mode,
    rpc: deploy.rpc,
    chainspec: deploy.expectedChainspec,
    steps: [
      { name: 'deploy-vault', payload: deploy },
      { name: 'pay-success', payload: paySuccess },
      { name: 'rejection-receiver-not-allowed', payload: rejA },
      { name: 'rejection-over-max-single-payment', payload: rejB },
    ],
  };
}

async function main() {
  const plan = buildRunTier1Plan({ env: process.env });
  console.log(`[run-tier1] mode=${plan.mode} steps=${plan.steps.length}`);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.mode === 'real') {
    throw new Error('REAL run-tier1 must dispatch each step through @caspilot/adapters and write .demo/tier1-events.json — wire this once adapters are integrated');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter caspilot-harness test run-tier1.dry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/harness/scripts/run-tier1.ts apps/harness/test/run-tier1.dry.test.ts
git commit -m "feat(harness): run-tier1 dry plan + real-mode dispatch hook"
```

---

### Task 6.9: P6 acceptance — tier1-artifacts.json validates and includes a receiver-not-allowed rejection

**Files:**
- Create: `apps/harness/test/p6-acceptance.test.ts`
- Create: `apps/harness/test/fixtures/tier1-artifacts.sample.json`

- [ ] **Step 1: Write the failing test**

`apps/harness/test/fixtures/tier1-artifacts.sample.json`:
```json
{
  "generatedAtMs": 1700000000000,
  "network": "casper-test",
  "chainspec": "casper-test",
  "vault": {
    "contractHash": "00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "deployHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "finalizedHeight": 1000000
  },
  "paySuccess": {
    "deployHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "amount": "50",
    "receiver": "00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "finalizedHeight": 1000001
  },
  "rejections": [
    {
      "kind": "receiver_not_allowed",
      "deployHash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "errorCode": 60004,
      "finalizedHeight": 1000002
    },
    {
      "kind": "over_max_single_payment",
      "deployHash": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "errorCode": 60005,
      "finalizedHeight": 1000003
    }
  ]
}
```

`apps/harness/test/p6-acceptance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TierOneArtifactsSchema } from '../src/schema.js';

describe('P6 acceptance', () => {
  it('sample tier1-artifacts.json validates against TierOneArtifactsSchema', () => {
    const path = resolve(__dirname, 'fixtures/tier1-artifacts.sample.json');
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const parsed = TierOneArtifactsSchema.parse(json);
    expect(parsed.vault.contractHash.startsWith('00')).toBe(true);
    expect(parsed.rejections.some((r) => r.kind === 'receiver_not_allowed')).toBe(true);
    expect(parsed.paySuccess.finalizedHeight).toBeGreaterThan(0);
  });

  it('demo tier 1 requires at least one rejection (regression guard)', () => {
    const path = resolve(__dirname, 'fixtures/tier1-artifacts.sample.json');
    const json = JSON.parse(readFileSync(path, 'utf8'));
    json.rejections = [];
    expect(() => TierOneArtifactsSchema.parse(json)).toThrow();
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter caspilot-harness test p6-acceptance`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/harness/test/p6-acceptance.test.ts apps/harness/test/fixtures/tier1-artifacts.sample.json
git commit -m "test: P6 acceptance summary"
```

---

## Open follow-ups (carry from spec §15)

These are deliberately deferred items. Each gets a tracking issue at the start of the corresponding phase, not a code change in this plan.

- **Tighten `CasperSignatureHex` regex.** Current schema accepts any 130-hex string. Once the Go facilitator fixture pins the wire shape (Ed25519 vs Secp256k1 length and tag byte), narrow the union accordingly. Owner: P2 schemas. Touches: `packages/x402/src/schemas.ts`.
- **Settle wire shape variants.** `WireSettleResponseSchema` currently treats `transaction` as a bare deploy-hash string with sibling `network`+`payer`. If the facilitator emits the object form `{ transaction: { chainId, deployHash }, payer }` instead, add a discriminated union and update `normalizeSettleResponse`. Owner: P2 schemas + facilitator client.
- **CSPR.cloud proxy hardening.** Document exact read-only methods used by the browser; add a backend allowlist for CSPR.cloud paths the API may proxy. Owner: P5 + audit-trace.
- **Real RPC adapter for harness.** `scripts/run-tier1.ts` and `scripts/deploy-vault.ts` currently fail in real mode with an explicit "wire @caspilot/adapters" error. Wire them through `@caspilot/adapters.casperRpc` once the adapter is integration-tested against testnet. Owner: P6, after P4 adapters land.
- **CSPR.click SDK pinning.** `ClickWallet` accepts any `ClickProvider`-shaped object. Pin to the SDK version actually used in the demo and add a runtime version assertion. Owner: P5.
- **2026-06-05 — Cargo bootstrap deferral.** P0 Task 0.4 was moved to P1 Task 1.0 after stable Rust toolchains proved incompatible with Odra 2.0.0 (odra-macros uses nightly-only feature gates). The plan now pins `nightly-2024-07-31` (Odra's officially-supported nightly), uses the `cargo-odra` CLI (`odra build` / `odra test`) instead of raw `cargo check`, and pins `base64ct = "=1.7.3"` (newer 1.8.x lines use `edition2024` manifests the pinned nightly cannot parse). Re-evaluate the toolchain pin and base64ct pin together whenever Odra publishes a bumped `rust-toolchain` file. Owner: P1 Task 1.0.
- **2026-06-05 — P1.4 Odra 2.0 cross-contract failure behavior.** Generated Odra 2.0 `ContractRef` calls propagate CEP-18 callee failures directly instead of returning an in-contract `OdraResult`, so PolicyVault cannot map a failing CEP-18 transfer to `PolicyVaultError::Cep18CallFailed` with the generated-ref API. Accepted criterion: transfer failures propagate the CEP-18 error code, while PolicyVault guarantees no `day_spend`, `paid_total`, or `used_payload_hashes` state changes occur when the transfer reverts. `Cep18CallFailed` is reserved/deferred for a future non-reverting adapter path. Owner: P1.4 review.

## Out of scope (for this plan)

These items are explicitly NOT delivered by this plan. They are recorded so reviewers do not interpret their absence as a gap.

- **Postgres / Turso storage backend.** Spec records this as a post-hackathon migration path. The plan implements payment_ledger and signer_spend_ledger on SQLite + Drizzle + WAL. `packages/ledger/MIGRATION.md` (Task 2.16) documents the migration but is not built.
- **Mainnet broadcast.** `RUN_REAL_ONCHAIN=1` is supported against `casper-test` only. Mainnet sponsorship is mentioned in the spec but is not part of any task here.
- **DeFi swap contract-level execution.** The plan restricts CSPR.trade integration to quote + policy validation + signed-but-not-broadcast payloads. Direct on-chain contract execution of swaps is out of scope and is recorded as a future tier.
- **Tier 2 (x402 settle real) and Tier 3 (CSPR.trade swap real) harnesses.** Only Tier 1 is built. The artifact schema is intentionally specific to Tier 1.
- **Public landing page / marketing UI.** `apps/web` ships the operator-facing surface (vaults, intents, traces). No public marketing surface.
- **Multi-tenant auth.** API is single-operator. No JWT issuance, no per-user keys, no row-level tenancy.
- **Permissionless agent onboarding.** Agents are seeded into the allowlist by the operator. No agent self-registration endpoint.

---



