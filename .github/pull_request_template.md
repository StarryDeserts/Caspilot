## Summary

-

## Test plan

- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `node scripts/check-cargo.mjs` (if contract or harness write path changed)

## Security checklist

- [ ] No secrets, private keys, or `.env` values committed.
- [ ] No user private keys added to API/server code.
- [ ] No privileged CSPR.cloud values exposed through `NEXT_PUBLIC_*`.
- [ ] Real Casper broadcasts remain opt-in and explicit.
