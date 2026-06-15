# Caspilot

Autonomous DeFi-yield agent for the Casper Agentic Buildathon 2026 — two product lines (an x402-paid agent API and a delegated on-chain PolicyVault) over one backend. The authoritative design is `docs/superpowers/specs/2026-06-05-caspilot-design.md`; the phased build lives in `docs/superpowers/plans/2026-06-05-caspilot-implementation.md`. The mandatory **Tier-1 on-chain demo** — with block-explorer-verifiable casper-test proof and how to reproduce it — is documented in [`docs/tier1-demo.md`](docs/tier1-demo.md).

## Status

- **P0 — Monorepo bootstrap: complete.** pnpm workspace, strict shared `tsconfig`, vitest, biome, GitHub Actions CI.
- **Phase 1 — PolicyVault Odra contract: complete (P1.0–P1.5).** The full spec §3A.2 ABI lives in `contracts/policy-vault/src/{lib.rs,errors.rs,events.rs}`: owner/admin controls (allow/revoke agents + receivers, `set_limits`, `set_valid_until`, `expire_now`), and `pay()` enforcing agent/receiver allowlists, validity window, per-payment + daily limits, UTC-day rollover, `payload_hash` replay protection, checked-add overflow, and a CEP-18 `transfer` after a self-balance check. 29 Rust tests pass and `PolicyVault.wasm` builds via the cargo-odra workflow (`node scripts/check-cargo.mjs`).
  - Odra 2.0 note: CEP-18 callee transfer failures propagate the CEP-18 error code directly (generated `ContractRef` calls revert on failure); PolicyVault's guarantee is that no `day_spend` / `paid_total` / `used_payload_hashes` state changes when a transfer reverts. `Cep18CallFailed` is reserved for a future non-reverting adapter path.
- **Phase 2 — x402 gateway + SQLite payment ledger: complete.** Two packages, `@caspilot/x402` (`packages/x402-gateway/`) and `@caspilot/payment-ledger`, ship the wire schemas (verify/settle/supported, frozen Go-pinned fixtures), the `PAYMENT-SIGNATURE` header codec, a replay-protection ledger (better-sqlite3, WAL, `UNIQUE(nonce,payer,asset)` + `UNIQUE(payload_hash)`), and the gateway over a thin `FacilitatorClient` that records each verified authorization and reconciles settle outcomes against it. 160 JS tests pass workspace-wide; tests use a fake facilitator and fake ledger (no network).
  - Implementation notes (deviations from spec §3B.0–§3B.3 worth carrying into Phase 3):
    - **Local `PaymentLedgerPort` is intentional.** `x402-gateway` depends on a local port interface (`packages/x402-gateway/src/ledger-port.ts`), **not** on `@caspilot/payment-ledger` directly. The real ledger package is structurally compatible; the adapter is wired at the API layer. This avoids a package cycle and a pre-build step in the build-free typecheck gate.
    - **`canonicalJson` / `canonicalSha256Hex` are currently local to `@caspilot/x402`** (`packages/x402-gateway/src/canonical.ts`). Spec §3B.3 expects them in `packages/shared` (does not exist yet). **Extract to `packages/shared` in Phase 3** rather than duplicating across new packages.
    - **`PaymentLedgerPort.markFailed(id, reason)` does NOT persist `reason`.** The LOCKED §3B.2 `payment_ledger` schema has no column for it — failure reasons belong in the audit trace keyed by `trace_id`. The `reason` parameter is kept only for interface conformance.
    - **`better-sqlite3` (12.10.0) is the allowed native dependency for the SQLite-backed ledger.** Root `package.json` declares `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` so the install script runs under pnpm 9. CI uses `ubuntu-latest` with Node 22, matching a better-sqlite3 prebuilt ABI (127) and avoiding the Node 20 source-compile path. Keep CI on Node 22+ unless deliberately accepting Node 20 native compilation risk.
- **Phase 3 — SignerGuard + SQLite spend ledger: complete.** `packages/shared` owns canonical JSON/SHA-256 helpers used by both x402 replay hashes and SignerGuard policy digests. `packages/signer-guard` provides policy parsing, deterministic `policyDigest`, deny-by-default rule checks, a SQLite `signer_spend_ledger` reservation model (`reserved`/`committed`/`released`, `UNIQUE(intent_id)`, daily cap accounting, `releaseExpired(nowMs, ttlMs)`), and a `RawSigner` interface tested with fake signers so denial paths never sign. Phase 3 intentionally does not include a real private-key signer, API/frontend routes, a background sweeper, or on-chain execution.
- **Phase 4 — Intent FSM + read-only adapters + audit trace + Hono API: complete (4.1–4.17).** `@caspilot/intent-fsm` (canonical states, deny-by-default `ALLOWED_TRANSITIONS`, branded ids, canonical JSON), `@caspilot/adapters` (read-only casper-rpc / CEP-18 / CSPR.cloud / CSPR.trade behind a capability guard — no write/broadcast path), and `@caspilot/audit-trace` (a redactor that strips reasoning/chain-of-thought before persistence) feed a Hono `apps/api`. Intent routes drive a reserve → commit → release spend lifecycle on the real `signer_spend_ledger`: `validate-policy` reserves (day-cap failure → 422 `day_cap_exceeded`; `UNIQUE(intent_id)` = replay protection), `mark-executed` validates the deploy hash then commits, `reject` releases an uncommitted reservation. Redaction runs upstream of `append()` and again on `/trace` export. 271 JS tests pass workspace-wide.
  - Demo fast-forward (documented in `apps/api/src/intents/router.ts`): `mark-executed` collapses POLICY_VALIDATED → EXECUTED, a hop the canonical FSM deliberately forbids; the API does not claim FSM conformance for it, and a later backend phase must drive the intermediate states step-by-step. Deferred backend hardening (none block P4): `SpendLedger.releaseExpired()` exists but is wired to no sweeper (abandoned reservations leak reserved budget until restart); audit payloads omit `reservationId`; `reject` tolerates malformed JSON where siblings 400; the placeholder signer public key differs between router and stub.
- **Phase 5 — Next.js web UI: complete (5.1–5.9).** `apps/web` (Next.js 14 App Router, React 18, Tailwind) talks to `apps/api` exclusively over `NEXT_PUBLIC_CASPILOT_API_BASE`. Security posture locked in: no privileged secret can reach the client (`src/lib/env.ts` `validatePublicEnv()` rejects privileged `NEXT_PUBLIC_*` names, and a build-time gate `scripts/check-bundle-secrets.mjs` scans the real `.next` bundle for named leak shapes and live secret values); the only user signer is CSPR.click (`src/lib/wallet.ts` rejects any provider exposing privileged fields — never a local/demo signer); and the audit trace is re-redacted client-side (`TraceList` strips a forbidden-key denylist). 34 web tests plus a `build:check` gate (`next build` → bundle scan) bring the workspace to 305 green.
- **Phase 6 — Tier-1 demo harness (real on-chain proof): complete.** `apps/harness` builds the write path the Phase-4 read-only adapters deliberately lacked — `buildVaultInstallDeploy` (ModuleBytes session install) and `buildVersionedContractCallDeploy` in `@caspilot/adapters`, local PEM signing via `loadLocalDevSigner` (the agent never holds the key; only a detached signature crosses the boundary), and `CasperDeployAdapter` broadcast/observe — and runs the full Tier-1 sequence end to end on casper-test: deploy PolicyVault → fund it → one accepted `pay()` → two policy-rejected `pay()`, sealed into a schema-valid `apps/harness/.demo/tier1-artifacts.json`. The gated vitest live runner (`test/run-tier1.live.test.ts`, `RUN_REAL_ONCHAIN=1`, casper-test only) drives it; the same file's offline integration tests run the whole orchestrator through injected seams with zero network. The workspace is now 428 JS tests green (2 gated live tests skip without `RUN_REAL_ONCHAIN=1`).
  - **Real casper-test proof (2026-06-15, blocks 8185770–8185776), independently verifiable on `testnet.cspr.live`:** vault `contractHash 8f75ba257f61ae1bbfa1f974a617705e519757445a77189d7c011327bdc5d63e` (install deploy `bf555d60…5431`); accepted `pay()` deploy `a7419aa2…2bdf5` (amount 50); rejections `e6801a75…cec7` (`receiver_not_allowed`, `User error: 3`) and `c4a48997…0eea` (`over_max_single_payment`, `User error: 4`). The rejection codes are the raw `PolicyVaultError` discriminants from `contracts/policy-vault/src/errors.rs`. The sealed `.demo/tier1-artifacts.json` is gitignored (local-only; re-run the live runner to regenerate), but the deploy hashes above are permanent on casper-test.
  - **Five casper-2.0 (Condor) testnet SDK/node compat fixes** landed to make the live broadcast work (found, fixed, proven on-chain): JSON-RPC envelope field (`version`→`jsonrpc`), reader named-keys `Account` shape, legacy `ContractPackage` under `hash-<pkg>`, deploy finalization observed via `getTransactionByDeployHash` (legacy deploys are transaction-wrapped), and the 7-arg odra-modules `Cep18::init` ABI.

## Toolchain

- Rust: `nightly-2024-07-31` with `wasm32-unknown-unknown`, `rustfmt`, and `clippy` from `rust-toolchain.toml`.
- Odra crates: `2.0.0`.
- `cargo-odra`: `0.1.7`.
- WASM tools: workspace dev dependencies `binaryen` (`wasm-opt`) and `wabt` (`wasm-strip`).
- Compatibility pins in `Cargo.lock`/workspace dependencies keep Odra 2.0.0 and registry crates on versions parseable by `nightly-2024-07-31` (`base64ct`, `blake3`, `clap`, `hashbrown`, `indexmap`, `proptest`, `tempfile`, and Odra subcrates).

Install the CLI used for local verification:

```bash
cargo install cargo-odra@0.1.7 --locked --features cargo-generate/vendored-openssl
```

The extra vendored OpenSSL feature keeps installation reproducible in environments without system `pkg-config`/OpenSSL development headers.

## Local checks

```bash
node scripts/check-cargo.mjs
node scripts/check-ci.mjs
pnpm typecheck
pnpm test
pnpm format:check
```

`node scripts/check-cargo.mjs` runs the supported Odra workflow from `contracts/policy-vault/` with `CARGO_TARGET_DIR=target` and `node_modules/.bin` on `PATH`:

```bash
cargo odra test -b casper
cargo odra build
```

`cargo-odra 0.1.7` supports the Casper backend flag for `test`; its actual `build` command does not accept `-b`, so P1 uses plain `cargo odra build` for the build half of the cargo-odra workflow. Use `cargo odra` commands as the default for P1 contract work. Do not use plain `cargo test` as the default unless a specific test is known to work under plain Cargo.
