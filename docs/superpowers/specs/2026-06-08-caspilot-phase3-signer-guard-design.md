# Caspilot Phase 3 — SignerGuard + SpendLedger Design

| Field | Value |
|---|---|
| Date | 2026-06-08 |
| Status | Design approved in conversation; written spec pending final user review |
| Scope | `packages/shared` canonical helpers, `packages/x402-gateway` canonical import migration, `packages/signer-guard` library-level guard + SQLite spend ledger |
| Explicit non-scope | Real private-key signer, Casper deploy signing adapter, Hono/API routes, frontend routes, background sweeper, PolicyVault contract changes, real on-chain execution |

## 1. Context

Phase 0, Phase 1, and Phase 2 are implemented. Phase 2 introduced `@caspilot/x402`, `@caspilot/payment-ledger`, frozen x402 wire fixtures, replay protection, and the local `PaymentLedgerPort` boundary. Commit `bc522a8` moved CI to Node 22 so `better-sqlite3` uses a supported prebuilt path instead of Node 20 source compilation.

Phase 3 builds the library-level safety layer that future API wiring must use before any signer can sign. It does not start Phase 4. The outcome is a tested package boundary proving that policy checks and spend reservation happen before signing, and denial paths never call the signer.

## 2. Goals

1. Extract canonical JSON hashing into `@caspilot/shared` so x402 replay hashes and SignerGuard policy digests share one implementation.
2. Add `@caspilot/signer-guard` with explicit signer role separation, policy validation, deterministic policy digest, per-rule checks, and a SQLite-backed spend reservation ledger.
3. Define a `RawSigner` interface and test it with fake signers only.
4. Provide `releaseExpired(nowMs, ttlMs)` for stale reservations, without starting a background timer or worker.
5. Keep API/frontend/private-key handling out of Phase 3.

## 3. Package boundaries

### 3.1 `@caspilot/shared`

Exports only the shared canonical helpers needed now:

- `canonicalJson(value: unknown): string`
- `canonicalSha256Hex(value: unknown): string`

The implementation preserves the Phase 2 behavior currently in `packages/x402-gateway/src/canonical.ts`: object keys are sorted recursively, array order is preserved, primitive values are unchanged, and the digest is SHA-256 lowercase hex of the canonical JSON bytes.

Phase 3 does not migrate all Casper branded types into shared. `@caspilot/signer-guard` may import existing primitive schemas/types from `@caspilot/x402` for now. A later cleanup can move branded Casper primitives into shared if multiple packages need them.

### 3.2 `@caspilot/x402`

`@caspilot/x402` stops owning canonical hashing and imports it from `@caspilot/shared`. Its public exports should continue to expose the helpers so existing callers and tests do not break.

This migration must not change frozen x402 fixture hashes or replay behavior.

### 3.3 `@caspilot/signer-guard`

The new package owns:

- signer role constants and types
- SignerGuard policy/config schema
- policy digest computation
- per-rule policy checks
- `SignerSpendLedger` interfaces and SQLite implementation
- `RawSigner` interface
- `makeSignerGuard({ spendLedger, signer, clock })`

It does not own real signer construction, env private key loading, Casper deploy signing, Hono routing, or audit trace persistence.

## 4. Core types

```ts
export const SIGNER_ROLES = ['user_cspr_click', 'local_dev', 'demo_sponsored'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export type ReceiverPolicy = 'deny_all' | 'allowlist' | 'allow_any_with_manual_approval';

export interface SignerGuardPolicy {
  signerRole: SignerRole;
  allowedChainIds: CasperCaip2ChainId[];
  allowedContractPackages: Cep18PackageHashHex[];
  allowedTokens: Cep18PackageHashHex[];
  receiverPolicy: ReceiverPolicy;
  allowedReceivers: CasperAccountAddressHex[];
  maxSinglePaymentAtomic: string;
  perDayCapAtomic: string;
  requireTraceId: boolean;
}

export interface UnsignedDeployEnvelope {
  headerJson: unknown;
  bodyHashHex: Hex64;
  payloadHex: string;
}

export interface SignRequest {
  policy: SignerGuardPolicy;
  intentId: string;
  traceId: string;
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  unsignedDeploy: UnsignedDeployEnvelope;
  intendedContractPackage: Cep18PackageHashHex;
  intendedReceiver: CasperAccountAddressHex;
  intendedToken: Cep18PackageHashHex;
  intendedAmountAtomic: string;
  intendedChainId: CasperCaip2ChainId;
}

export type SignDenial =
  | 'signer_role_mismatch'
  | 'trace_id_missing'
  | 'chain_not_allowed'
  | 'package_not_allowed'
  | 'token_not_allowed'
  | 'receiver_not_allowed'
  | 'amount_above_single_cap'
  | 'day_cap_exceeded'
  | 'reservation_conflict'
  | 'signer_failed';

export type SignResult =
  | { ok: true; signatureHex: string; reservationId: string; policyDigest: string }
  | { ok: false; reason: SignDenial; policyDigest?: string };

export interface RawSigner {
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  sign(unsignedDeploy: UnsignedDeployEnvelope): Promise<{ signatureHex: string }>;
}
```

`signerRole` and `signerPk` are present both on `RawSigner` and on `SignRequest`. The guard checks they match `policy.signerRole`, preventing an API caller from routing a request intended for one signer role through another signer.

## 5. Policy validation and digest

`SignerGuardPolicySchema` validates system-boundary policy config. Critical allowlists are `.min(1)` so empty lists cannot accidentally boot as ambiguous configs:

- `allowedChainIds`
- `allowedContractPackages`
- `allowedTokens`
- `allowedReceivers` when `receiverPolicy === 'allowlist'`

At rule-check time, empty allowlists are still treated as deny-all. This keeps the runtime safe even when tests or internal callers construct policy objects directly.

Amounts must be unsigned decimal integer strings. Comparisons use `BigInt`; invalid amount strings are rejected as policy/config validation failures before signing.

`computePolicyDigest(policy)` uses `canonicalSha256Hex(policy)` from `@caspilot/shared`. Object key order and whitespace cannot affect the digest; array order remains semantic and therefore affects the digest.

`receiverPolicy` behavior in Phase 3:

- `deny_all`: always denies.
- `allowlist`: allows only `intendedReceiver` values in `allowedReceivers`.
- `allow_any_with_manual_approval`: denies in Phase 3 because no manual approval artifact exists yet. Phase 4 may add an explicit approval proof and route-level checks.

## 6. SpendLedger reservation model

### 6.1 Table

`@caspilot/signer-guard` owns a SQLite table named `signer_spend_ledger`:

```sql
CREATE TABLE signer_spend_ledger (
  id           TEXT PRIMARY KEY,
  signer_role  TEXT NOT NULL,
  signer_pk    TEXT NOT NULL,
  token        TEXT NOT NULL,
  day_utc      TEXT NOT NULL,
  amount       TEXT NOT NULL,
  status       TEXT NOT NULL,
  intent_id    TEXT NOT NULL,
  trace_id     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (intent_id)
);

CREATE INDEX ix_signer_spend_day
  ON signer_spend_ledger(signer_role, signer_pk, token, day_utc, status);
```

Valid statuses are `reserved`, `committed`, and `released`.

### 6.2 Interface

```ts
export interface SpendReservation {
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  token: Cep18PackageHashHex;
  dayUtc: string;
  amount: string;
  intentId: string;
  traceId: string;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'day_cap_exceeded' | 'reservation_conflict' };

export interface SpendLedger {
  reserve(reservation: SpendReservation, dayCapAtomic: string): Promise<ReserveResult>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
  releaseExpired(nowMs: number, ttlMs: number): Promise<number>;
}
```

### 6.3 Reserve flow

`reserve()` runs in one SQLite transaction:

1. Sum `amount` for matching `(signer_role, signer_pk, token, day_utc)` where status is `reserved` or `committed`.
2. If `spent + reservation.amount > dayCapAtomic`, return `day_cap_exceeded` without inserting.
3. Insert a `reserved` row.
4. If `UNIQUE(intent_id)` fails, return `reservation_conflict`.
5. Return `{ ok: true, reservationId }`.

This follows the single API instance + SQLite WAL assumption already used by Phase 2.

### 6.4 Commit, release, and expiry

`commit(reservationId)` changes only `reserved -> committed`. `release(reservationId)` changes only `reserved -> released`. They do not move terminal rows back to another state.

`releaseExpired(nowMs, ttlMs)` changes stale `reserved` rows to `released` where `created_at <= nowMs - ttlMs`, updates `updated_at`, and returns the number of released rows. Phase 3 does not create a timer; Phase 4 decides when to call this method.

`committed` rows continue counting against the day cap. `released` rows do not count.

## 7. SignerGuard flow

`makeSignerGuard({ spendLedger, signer, clock })` returns an object with `authorize(req)`.

The flow is strict:

1. Compute `policyDigest`.
2. Verify `policy.signerRole === req.signerRole === signer.signerRole` and `req.signerPk === signer.signerPk`.
3. If `policy.requireTraceId`, reject empty `traceId`.
4. Check intended chain.
5. Check intended contract package.
6. Check intended token.
7. Check receiver policy.
8. Check `intendedAmountAtomic <= maxSinglePaymentAtomic`.
9. Compute current UTC day from `clock()`.
10. Reserve spend in `SpendLedger` using `perDayCapAtomic`.
11. Only after a successful reservation, call `RawSigner.sign(req.unsignedDeploy)`.
12. Return signature, reservation id, and policy digest.

Denial behavior:

- Any rule failure before reservation returns `{ ok: false, reason, policyDigest }`; no ledger row is inserted and `RawSigner.sign()` is not called.
- `reserve()` failure returns `day_cap_exceeded` or `reservation_conflict`; `RawSigner.sign()` is not called.
- If `RawSigner.sign()` throws after reservation, the guard releases that reservation and returns `signer_failed`; no partial signature data is returned.

The guard does not parse deploy bytes. It trusts the `intended*` fields as the boundary contract from Phase 4's intent FSM and adapters. This keeps Phase 3 focused and testable while making the API integration responsibility explicit.

## 8. Audit and trace handoff

Phase 3 does not persist audit traces. It returns structured reasons, `reservationId`, and `policyDigest` so Phase 4 can attach them to `AuditTraceInternal.policyChecks` and intent state transitions.

Failure reasons are never stored in `payment_ledger`; that Phase 2 decision remains unchanged. SignerGuard failures similarly stay structured at the package boundary until Phase 4 writes the audit trace store.

## 9. Security invariants

1. No user private key is stored or loaded in Phase 3.
2. No env private key signer is implemented in Phase 3.
3. Denial paths never call `RawSigner.sign()`.
4. A role mismatch between policy, request, and signer denies before reserve/sign.
5. Spend is reserved before signing.
6. Duplicate `intentId` cannot reserve twice.
7. `reserved + committed` spend counts toward the daily cap.
8. `released` spend does not count toward the daily cap.
9. `allow_any_with_manual_approval` is deny-by-default until Phase 4 introduces an approval proof.
10. Canonical policy digest and x402 replay hash share the same canonical JSON implementation.

## 10. Testing plan

### `@caspilot/shared`

- `canonicalJson` is deterministic for object key order.
- Array order is preserved.
- `canonicalSha256Hex` is stable and lowercase hex.
- Existing x402 tests still pass after import migration.

### `@caspilot/signer-guard` config and digest

- Canonical policy parses.
- Empty critical allowlists fail schema validation.
- Runtime rule checks treat empty allowlists as deny-all.
- Policy digest ignores object key order.
- Policy digest preserves array ordering.
- Changing `receiverPolicy`, amount caps, or allowlists changes the digest.

### SpendLedger

- First reserve under cap succeeds.
- Reserve over cap returns `day_cap_exceeded`.
- `reserved + committed` counts toward cap.
- `released` does not count toward cap.
- `commit()` preserves cap consumption.
- `release()` frees cap consumption.
- Duplicate `intentId` returns `reservation_conflict`.
- UTC day rollover starts a fresh cap window.
- Two concurrent or near-concurrent reserves cannot both pass if together they exceed the cap.
- `releaseExpired(nowMs, ttlMs)` releases only stale reserved rows and returns the count.

### SignerGuard

- Denies `signer_role_mismatch` before reserve/sign.
- Denies missing trace id when required.
- Denies chain, package, token, receiver, and max-single violations.
- Denies `allow_any_with_manual_approval` in Phase 3.
- Reserves before signing on success.
- Returns `reservationId`, `signatureHex`, and `policyDigest` on success.
- Does not call fake signer on any denial path.
- Releases reservation if fake signer throws.
- Does not return signature bytes on failure.

## 11. Acceptance gates

Before Phase 3 is considered complete:

```bash
pnpm typecheck
pnpm test
pnpm format:check
node scripts/check-ci.mjs
```

`node scripts/check-cargo.mjs` should also remain green before a final branch handoff, even though Phase 3 should not modify Rust contract code.

## 12. Implementation constraints

- Use TDD for each package slice.
- Prefer the existing Phase 2 package/test style.
- Keep commits small and scoped.
- Do not add API/frontend routes.
- Do not implement real private-key signing.
- Do not modify PolicyVault unless an unrelated mechanical CI issue requires it.
- Do not broaden `packages/shared` beyond canonical helpers unless a test demonstrates the need.
