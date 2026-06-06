# Caspilot

Autonomous DeFi-yield agent for the Casper Agentic Buildathon 2026 — two product lines (an x402-paid agent API and a delegated on-chain PolicyVault) over one backend. The authoritative design is `docs/superpowers/specs/2026-06-05-caspilot-design.md`; the phased build lives in `docs/superpowers/plans/2026-06-05-caspilot-implementation.md`.

## Status

- **P0 — Monorepo bootstrap: complete.** pnpm workspace, strict shared `tsconfig`, vitest, biome, GitHub Actions CI.
- **Phase 1 — PolicyVault Odra contract: complete (P1.0–P1.5).** The full spec §3A.2 ABI lives in `contracts/policy-vault/src/{lib.rs,errors.rs,events.rs}`: owner/admin controls (allow/revoke agents + receivers, `set_limits`, `set_valid_until`, `expire_now`), and `pay()` enforcing agent/receiver allowlists, validity window, per-payment + daily limits, UTC-day rollover, `payload_hash` replay protection, checked-add overflow, and a CEP-18 `transfer` after a self-balance check. 29 Rust tests pass and `PolicyVault.wasm` builds via the cargo-odra workflow (`node scripts/check-cargo.mjs`).
  - Odra 2.0 note: CEP-18 callee transfer failures propagate the CEP-18 error code directly (generated `ContractRef` calls revert on failure); PolicyVault's guarantee is that no `day_spend` / `paid_total` / `used_payload_hashes` state changes when a transfer reverts. `Cep18CallFailed` is reserved for a future non-reverting adapter path.
- **Phases 2–6 — not started:** x402 gateway + payment ledger, SignerGuard, intent FSM + adapters + Hono API, Next.js web UI, and the Tier-1 demo harness (real on-chain proof).

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
