# Caspilot

P0 bootstrapped the TypeScript monorepo. P1.0 adds the Rust/Odra workspace for the minimal `policy_vault` contract stub under `contracts/policy-vault/`.

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
