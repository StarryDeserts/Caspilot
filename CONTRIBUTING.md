# Contributing

Thanks for improving Caspilot. This repository is a pnpm monorepo with TypeScript packages, a Next.js web app, a Hono API, and an Odra smart contract.

## Local setup

```bash
pnpm install
pnpm typecheck
pnpm test
```

For contract checks:

```bash
node scripts/check-cargo.mjs
```

## Pull request checklist

- Keep signer separation intact: no user private keys in the API, no privileged CSPR.cloud keys in the frontend.
- Validate external input at the API boundary.
- Keep audit traces redacted; do not persist prompts or chain-of-thought.
- Add or update tests for behavior changes.
- Run `pnpm format:check`, `pnpm typecheck`, and `pnpm test` before requesting review.
- If you touch contract logic, run `node scripts/check-cargo.mjs`.

## Live network safety

Real Casper Testnet broadcasts must stay opt-in. Do not remove `RUN_REAL_ONCHAIN=1` gates or add automatic broadcasting from tests, seeds, or startup code.
