# Caspilot Phase 3 SignerGuard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 3 as a library-level safety layer: shared canonical hashing, x402 canonical migration, SignerGuard policy checks, SQLite spend reservation ledger, and a fake-signer-tested `RawSigner` boundary.

**Architecture:** Create `@caspilot/shared` for canonical JSON hashing, migrate `@caspilot/x402` to re-export those helpers, then add `@caspilot/signer-guard` as a standalone package. SignerGuard validates explicit intended fields, reserves spend in SQLite before signing, and calls only an injected `RawSigner` interface; no real private-key signer, API route, frontend route, background sweeper, or PolicyVault change is in scope.

**Tech Stack:** pnpm workspace, TypeScript strict NodeNext, Vitest, Biome, Zod, better-sqlite3, Drizzle SQLite, Node 22 CI.

---

## Source documents

- Approved design: `docs/superpowers/specs/2026-06-08-caspilot-phase3-signer-guard-design.md`
- Existing full product spec: `docs/superpowers/specs/2026-06-05-caspilot-design.md`
- Existing phased plan: `docs/superpowers/plans/2026-06-05-caspilot-implementation.md`
- Existing x402 package: `packages/x402-gateway/`
- Existing SQLite pattern: `packages/payment-ledger/`

## File structure

Create or modify these files:

- Create `packages/shared/package.json` — package metadata and scripts for shared helpers.
- Create `packages/shared/tsconfig.json` — strict package TypeScript config.
- Create `packages/shared/vitest.config.ts` — Vitest base config import.
- Create `packages/shared/src/canonical.ts` — canonical JSON + SHA-256 helpers moved from x402.
- Create `packages/shared/src/index.ts` — shared package public exports.
- Create `packages/shared/test/canonical.test.ts` — canonical helper behavior tests.
- Modify `packages/x402-gateway/package.json` — add `@caspilot/shared` dependency.
- Modify `packages/x402-gateway/src/canonical.ts` — re-export canonical helpers from shared.
- Create `packages/x402-gateway/test/canonical-shared.test.ts` — guard against divergent canonical implementations.
- Create `packages/signer-guard/package.json` — package metadata and scripts.
- Create `packages/signer-guard/tsconfig.json` — strict package TypeScript config.
- Create `packages/signer-guard/vitest.config.ts` — Vitest base config import.
- Create `packages/signer-guard/src/types.ts` — signer roles, policies, request/result types, `RawSigner`.
- Create `packages/signer-guard/src/config.ts` — Zod schema for policy config.
- Create `packages/signer-guard/src/digest.ts` — policy digest using shared canonical hashing.
- Create `packages/signer-guard/src/rules.ts` — pure policy rule checks.
- Create `packages/signer-guard/src/schema.ts` — Drizzle table definition for `signer_spend_ledger`.
- Create `packages/signer-guard/src/db.ts` — better-sqlite3 handle + DDL.
- Create `packages/signer-guard/src/spend-ledger.ts` — reservation, commit, release, expiry.
- Create `packages/signer-guard/src/guard.ts` — orchestration before signer call.
- Create `packages/signer-guard/src/index.ts` — package public exports.
- Create `packages/signer-guard/test/_smoke.test.ts` — package smoke test.
- Create `packages/signer-guard/test/config.test.ts` — config validation tests.
- Create `packages/signer-guard/test/digest.test.ts` — policy digest tests.
- Create `packages/signer-guard/test/rules.test.ts` — pure denial/allow rule tests.
- Create `packages/signer-guard/test/spend-ledger.test.ts` — SQLite reservation model tests.
- Create `packages/signer-guard/test/guard.test.ts` — SignerGuard fake signer tests.
- Modify `pnpm-lock.yaml` — workspace lockfile after adding packages/dependencies.

---

### Task 1: Create `@caspilot/shared` canonical helpers

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/canonical.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/canonical.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/test/canonical.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalSha256Hex } from '../src/index.js';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 2, a: { z: 1, y: 0 } })).toBe('{"a":{"y":0,"z":1},"b":2}');
  });

  it('preserves array order because arrays can be semantically ordered', () => {
    expect(canonicalJson({ values: [{ b: 2, a: 1 }, { a: 3 }] })).toBe(
      '{"values":[{"a":1,"b":2},{"a":3}]}',
    );
  });

  it('preserves atomic amount strings exactly', () => {
    expect(canonicalJson({ amount: '000123', nested: { cap: '5000' } })).toBe(
      '{"amount":"000123","nested":{"cap":"5000"}}',
    );
  });
});

describe('canonicalSha256Hex', () => {
  it('hashes the canonical JSON string as lowercase hex', () => {
    const canonical = '{"a":1,"b":2}';
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toBe(sha256Hex(canonical));
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/shared test
```

Expected: FAIL because `@caspilot/shared` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared/package.json`:

```json
{
  "name": "@caspilot/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "@types/node": "^22",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/shared/vitest.config.ts`:

```ts
import base from '../../vitest.config.base.js';

export default base;
```

Create `packages/shared/src/canonical.ts`:

```ts
import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

export function canonicalSha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from './canonical.js';
```

- [ ] **Step 4: Install and run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot install
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/shared test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/shared typecheck
```

Expected: shared tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/shared pnpm-lock.yaml
git -C /home/stardust/dev/HackQuest/caspilot commit -m "feat(shared): add canonical hashing helpers"
```

---

### Task 2: Migrate x402 canonical helpers to shared

**Files:**
- Modify: `packages/x402-gateway/package.json`
- Modify: `packages/x402-gateway/src/canonical.ts`
- Create: `packages/x402-gateway/test/canonical-shared.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing test**

Create `packages/x402-gateway/test/canonical-shared.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canonicalJson as sharedCanonicalJson } from '@caspilot/shared';
import { canonicalJson, canonicalSha256Hex } from '../src/index.js';

describe('x402 canonical helpers', () => {
  it('re-export the shared canonical JSON behavior', () => {
    const value = { z: 1, a: { b: 2, a: 1 } };
    expect(canonicalJson(value)).toBe(sharedCanonicalJson(value));
    expect(canonicalJson(value)).toBe('{"a":{"a":1,"b":2},"z":1}');
  });

  it('keeps the existing public digest export', () => {
    expect(canonicalSha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/x402 test canonical-shared
```

Expected: FAIL until `@caspilot/x402` declares and uses `@caspilot/shared`.

- [ ] **Step 3: Write minimal implementation**

Modify `packages/x402-gateway/package.json` so `dependencies` becomes:

```json
"dependencies": {
  "@caspilot/shared": "workspace:*",
  "zod": "^3.23.8"
}
```

Replace `packages/x402-gateway/src/canonical.ts` with:

```ts
export { canonicalJson, canonicalSha256Hex } from '@caspilot/shared';
```

- [ ] **Step 4: Install and run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot install
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/x402 test canonical-shared
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/x402 test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/x402 typecheck
```

Expected: x402 canonical migration test passes; all 150 x402 tests still pass.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/x402-gateway pnpm-lock.yaml
git -C /home/stardust/dev/HackQuest/caspilot commit -m "refactor(x402): use shared canonical hashing"
```

---

### Task 3: Scaffold `@caspilot/signer-guard` and core types

**Files:**
- Create: `packages/signer-guard/package.json`
- Create: `packages/signer-guard/tsconfig.json`
- Create: `packages/signer-guard/vitest.config.ts`
- Create: `packages/signer-guard/src/types.ts`
- Create: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/_smoke.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing test**

Create `packages/signer-guard/test/_smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SIGNER_ROLES } from '../src/index.js';

describe('SIGNER_ROLES', () => {
  it('declares the three separated signer roles', () => {
    expect(SIGNER_ROLES).toEqual(['user_cspr_click', 'local_dev', 'demo_sponsored']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test
```

Expected: FAIL because `@caspilot/signer-guard` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/signer-guard/package.json`:

```json
{
  "name": "@caspilot/signer-guard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@caspilot/shared": "workspace:*",
    "@caspilot/x402": "workspace:*",
    "better-sqlite3": "^12.2.0",
    "drizzle-orm": "^0.44.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@caspilot/tsconfig": "workspace:*",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

Create `packages/signer-guard/tsconfig.json`:

```json
{
  "extends": "@caspilot/tsconfig/tsconfig.lib.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/signer-guard/vitest.config.ts`:

```ts
import base from '../../vitest.config.base.js';

export default base;
```

Create `packages/signer-guard/src/types.ts`:

```ts
import type {
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  CasperPublicKeyHex,
  Cep18PackageHashHex,
  Hex64,
} from '@caspilot/x402';

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

Create `packages/signer-guard/src/index.ts`:

```ts
export * from './types.js';
```

- [ ] **Step 4: Install and run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot install
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: smoke test passes and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard pnpm-lock.yaml
git -C /home/stardust/dev/HackQuest/caspilot commit -m "chore(signer-guard): scaffold package"
```

---

### Task 4: Add policy config schema and policy digest

**Files:**
- Create: `packages/signer-guard/src/config.ts`
- Create: `packages/signer-guard/src/digest.ts`
- Modify: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/config.test.ts`
- Create: `packages/signer-guard/test/digest.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `packages/signer-guard/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SignerGuardPolicySchema } from '../src/config.js';

const ACCOUNT_A = `00${'a'.repeat(64)}`;
const ACCOUNT_B = `00${'b'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const PACKAGE = '2'.repeat(64);

function policy(overrides: Record<string, unknown> = {}): unknown {
  return {
    signerRole: 'local_dev',
    allowedChainIds: ['casper:casper-test'],
    allowedContractPackages: [PACKAGE],
    allowedTokens: [TOKEN],
    receiverPolicy: 'allowlist',
    allowedReceivers: [ACCOUNT_A, ACCOUNT_B],
    maxSinglePaymentAtomic: '500',
    perDayCapAtomic: '5000',
    requireTraceId: true,
    ...overrides,
  };
}

describe('SignerGuardPolicySchema', () => {
  it('parses a canonical policy', () => {
    const parsed = SignerGuardPolicySchema.parse(policy());
    expect(parsed.signerRole).toBe('local_dev');
    expect(parsed.allowedTokens).toEqual([TOKEN]);
  });

  it('rejects empty critical allowlists', () => {
    expect(SignerGuardPolicySchema.safeParse(policy({ allowedChainIds: [] })).success).toBe(false);
    expect(SignerGuardPolicySchema.safeParse(policy({ allowedContractPackages: [] })).success).toBe(
      false,
    );
    expect(SignerGuardPolicySchema.safeParse(policy({ allowedTokens: [] })).success).toBe(false);
    expect(SignerGuardPolicySchema.safeParse(policy({ allowedReceivers: [] })).success).toBe(false);
  });

  it('allows empty receivers for deny_all because that policy denies every receiver', () => {
    expect(
      SignerGuardPolicySchema.safeParse(
        policy({ receiverPolicy: 'deny_all', allowedReceivers: [] }),
      ).success,
    ).toBe(true);
  });

  it('rejects allow_any_with_manual_approval with empty receivers at config time', () => {
    expect(
      SignerGuardPolicySchema.safeParse(
        policy({ receiverPolicy: 'allow_any_with_manual_approval', allowedReceivers: [] }),
      ).success,
    ).toBe(false);
  });

  it('rejects max single above daily cap', () => {
    expect(
      SignerGuardPolicySchema.safeParse(
        policy({ maxSinglePaymentAtomic: '6000', perDayCapAtomic: '5000' }),
      ).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing digest tests**

Create `packages/signer-guard/test/digest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePolicyDigest } from '../src/digest.js';
import type { SignerGuardPolicy } from '../src/types.js';

const policy: SignerGuardPolicy = {
  signerRole: 'local_dev',
  allowedChainIds: ['casper:casper-test'],
  allowedContractPackages: ['2'.repeat(64)],
  allowedTokens: ['1'.repeat(64)],
  receiverPolicy: 'allowlist',
  allowedReceivers: [`00${'a'.repeat(64)}`],
  maxSinglePaymentAtomic: '500',
  perDayCapAtomic: '5000',
  requireTraceId: true,
};

describe('computePolicyDigest', () => {
  it('ignores object key order', () => {
    const reordered = {
      requireTraceId: true,
      perDayCapAtomic: '5000',
      maxSinglePaymentAtomic: '500',
      allowedReceivers: [`00${'a'.repeat(64)}`],
      receiverPolicy: 'allowlist',
      allowedTokens: ['1'.repeat(64)],
      allowedContractPackages: ['2'.repeat(64)],
      allowedChainIds: ['casper:casper-test'],
      signerRole: 'local_dev',
    } satisfies SignerGuardPolicy;

    expect(computePolicyDigest(policy)).toBe(computePolicyDigest(reordered));
  });

  it('preserves array ordering as semantic input', () => {
    const changedOrder: SignerGuardPolicy = {
      ...policy,
      allowedReceivers: [`00${'b'.repeat(64)}`, `00${'a'.repeat(64)}`],
    };
    const originalOrder: SignerGuardPolicy = {
      ...policy,
      allowedReceivers: [`00${'a'.repeat(64)}`, `00${'b'.repeat(64)}`],
    };

    expect(computePolicyDigest(changedOrder)).not.toBe(computePolicyDigest(originalOrder));
  });

  it('changes when receiver policy changes', () => {
    expect(computePolicyDigest(policy)).not.toBe(
      computePolicyDigest({ ...policy, receiverPolicy: 'deny_all', allowedReceivers: [] }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test config digest
```

Expected: FAIL because `config.ts` and `digest.ts` do not exist.

- [ ] **Step 4: Write minimal implementation**

Create `packages/signer-guard/src/config.ts`:

```ts
import { z } from 'zod';
import {
  AtomicDecimalString,
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  Cep18PackageHashHex,
} from '@caspilot/x402';
import { SIGNER_ROLES } from './types.js';

export const ReceiverPolicySchema = z.enum(['deny_all', 'allowlist', 'allow_any_with_manual_approval']);

export const SignerGuardPolicySchema = z
  .object({
    signerRole: z.enum(SIGNER_ROLES),
    allowedChainIds: z.array(CasperCaip2ChainId).min(1, 'empty chain allowlist is deny-all'),
    allowedContractPackages: z
      .array(Cep18PackageHashHex)
      .min(1, 'empty contract package allowlist is deny-all'),
    allowedTokens: z.array(Cep18PackageHashHex).min(1, 'empty token allowlist is deny-all'),
    receiverPolicy: ReceiverPolicySchema,
    allowedReceivers: z.array(CasperAccountAddressHex),
    maxSinglePaymentAtomic: AtomicDecimalString,
    perDayCapAtomic: AtomicDecimalString,
    requireTraceId: z.boolean(),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (policy.receiverPolicy !== 'deny_all' && policy.allowedReceivers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedReceivers'],
        message: 'empty receiver allowlist is deny-all',
      });
    }
    if (BigInt(policy.maxSinglePaymentAtomic) > BigInt(policy.perDayCapAtomic)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSinglePaymentAtomic'],
        message: 'max single payment cannot exceed daily cap',
      });
    }
  });

export type SignerGuardPolicyConfig = z.infer<typeof SignerGuardPolicySchema>;
```

Create `packages/signer-guard/src/digest.ts`:

```ts
import { canonicalSha256Hex } from '@caspilot/shared';
import type { SignerGuardPolicy } from './types.js';

export function computePolicyDigest(policy: SignerGuardPolicy): string {
  return canonicalSha256Hex(policy);
}
```

Replace `packages/signer-guard/src/index.ts` with:

```ts
export * from './types.js';
export * from './config.js';
export * from './digest.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test config digest
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: config and digest tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/src packages/signer-guard/test
git -C /home/stardust/dev/HackQuest/caspilot commit -m "feat(signer-guard): add policy schema and digest"
```

---

### Task 5: Add pure policy rule checks

**Files:**
- Create: `packages/signer-guard/src/rules.ts`
- Modify: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/signer-guard/test/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkPolicyRules } from '../src/rules.js';
import type { SignRequest } from '../src/types.js';

const RECEIVER = `00${'a'.repeat(64)}`;
const OTHER_RECEIVER = `00${'b'.repeat(64)}`;
const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const CONTRACT = '2'.repeat(64);
const BODY_HASH = '3'.repeat(64);

function request(overrides: Partial<SignRequest> = {}): SignRequest {
  const base: SignRequest = {
    policy: {
      signerRole: 'local_dev',
      allowedChainIds: ['casper:casper-test'],
      allowedContractPackages: [CONTRACT],
      allowedTokens: [TOKEN],
      receiverPolicy: 'allowlist',
      allowedReceivers: [RECEIVER],
      maxSinglePaymentAtomic: '500',
      perDayCapAtomic: '5000',
      requireTraceId: true,
    },
    intentId: 'intent-1',
    traceId: 'trace-1',
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    unsignedDeploy: { headerJson: { account: SIGNER_PK }, bodyHashHex: BODY_HASH, payloadHex: 'abcd' },
    intendedContractPackage: CONTRACT,
    intendedReceiver: RECEIVER,
    intendedToken: TOKEN,
    intendedAmountAtomic: '500',
    intendedChainId: 'casper:casper-test',
  };
  return { ...base, ...overrides, policy: { ...base.policy, ...overrides.policy } };
}

describe('checkPolicyRules', () => {
  it('allows a request that matches every policy rule', () => {
    expect(checkPolicyRules(request())).toBeNull();
  });

  it('denies missing trace id before other checks when trace id is required', () => {
    expect(checkPolicyRules(request({ traceId: '' }))).toBe('trace_id_missing');
  });

  it('denies chain, package, token, receiver, and amount violations', () => {
    expect(checkPolicyRules(request({ intendedChainId: 'casper:wrong' }))).toBe('chain_not_allowed');
    expect(checkPolicyRules(request({ intendedContractPackage: '4'.repeat(64) }))).toBe(
      'package_not_allowed',
    );
    expect(checkPolicyRules(request({ intendedToken: '5'.repeat(64) }))).toBe('token_not_allowed');
    expect(checkPolicyRules(request({ intendedReceiver: OTHER_RECEIVER }))).toBe(
      'receiver_not_allowed',
    );
    expect(checkPolicyRules(request({ intendedAmountAtomic: '501' }))).toBe(
      'amount_above_single_cap',
    );
  });

  it('treats empty runtime allowlists as deny-all', () => {
    expect(checkPolicyRules(request({ policy: { allowedTokens: [] } }))).toBe('token_not_allowed');
  });

  it('denies deny_all and allow_any_with_manual_approval receiver policies in Phase 3', () => {
    expect(checkPolicyRules(request({ policy: { receiverPolicy: 'deny_all' } }))).toBe(
      'receiver_not_allowed',
    );
    expect(
      checkPolicyRules(request({ policy: { receiverPolicy: 'allow_any_with_manual_approval' } })),
    ).toBe('receiver_not_allowed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test rules
```

Expected: FAIL because `rules.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/signer-guard/src/rules.ts`:

```ts
import type { SignDenial, SignRequest } from './types.js';

export function checkPolicyRules(req: SignRequest): Exclude<SignDenial, 'day_cap_exceeded' | 'reservation_conflict' | 'signer_failed' | 'signer_role_mismatch'> | null {
  if (req.policy.requireTraceId && req.traceId.length === 0) return 'trace_id_missing';
  if (!req.policy.allowedChainIds.includes(req.intendedChainId)) return 'chain_not_allowed';
  if (!req.policy.allowedContractPackages.includes(req.intendedContractPackage)) {
    return 'package_not_allowed';
  }
  if (!req.policy.allowedTokens.includes(req.intendedToken)) return 'token_not_allowed';
  if (receiverDenied(req)) return 'receiver_not_allowed';
  if (BigInt(req.intendedAmountAtomic) > BigInt(req.policy.maxSinglePaymentAtomic)) {
    return 'amount_above_single_cap';
  }
  return null;
}

function receiverDenied(req: SignRequest): boolean {
  if (req.policy.receiverPolicy === 'deny_all') return true;
  if (req.policy.receiverPolicy === 'allow_any_with_manual_approval') return true;
  return !req.policy.allowedReceivers.includes(req.intendedReceiver);
}
```

Replace `packages/signer-guard/src/index.ts` with:

```ts
export * from './types.js';
export * from './config.js';
export * from './digest.js';
export * from './rules.js';
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test rules
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: rules tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/src packages/signer-guard/test/rules.test.ts
git -C /home/stardust/dev/HackQuest/caspilot commit -m "feat(signer-guard): add policy rule checks"
```

---

### Task 6: Add SQLite spend ledger reservation model

**Files:**
- Create: `packages/signer-guard/src/schema.ts`
- Create: `packages/signer-guard/src/db.ts`
- Create: `packages/signer-guard/src/spend-ledger.ts`
- Modify: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/spend-ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/signer-guard/test/spend-ledger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';
import { makeSpendLedger } from '../src/spend-ledger.js';
import type { SpendLedger, SpendReservation } from '../src/spend-ledger.js';

const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);

function reservation(overrides: Partial<SpendReservation> = {}): SpendReservation {
  return {
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    token: TOKEN,
    dayUtc: '2026-06-08',
    amount: '500',
    intentId: 'intent-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('SpendLedger reservation model', () => {
  let handle: SignerGuardDbHandle;
  let ledger: SpendLedger;
  let now = 1_717_000_000_000;

  beforeEach(() => {
    handle = openSignerGuardDb();
    ledger = makeSpendLedger(handle.db, () => now);
  });

  afterEach(() => {
    handle.close();
  });

  it('first reserve under cap succeeds and returns a reservation id', async () => {
    const result = await ledger.reserve(reservation(), '1000');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reserved plus committed spend counts toward the day cap', async () => {
    const first = await ledger.reserve(reservation({ amount: '600' }), '1000');
    expect(first.ok).toBe(true);
    if (first.ok) await ledger.commit(first.reservationId);

    const second = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', amount: '500' }),
      '1000',
    );
    expect(second).toEqual({ ok: false, reason: 'day_cap_exceeded' });
  });

  it('release frees reserved spend for another intent', async () => {
    const first = await ledger.reserve(reservation({ amount: '900' }), '1000');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await ledger.release(first.reservationId);
    const second = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', amount: '900' }),
      '1000',
    );
    expect(second.ok).toBe(true);
  });

  it('UNIQUE(intent_id) prevents double reserve for the same intent', async () => {
    expect((await ledger.reserve(reservation(), '1000')).ok).toBe(true);
    expect(await ledger.reserve(reservation({ amount: '100' }), '1000')).toEqual({
      ok: false,
      reason: 'reservation_conflict',
    });
  });

  it('day_utc rollover starts a fresh cap window', async () => {
    expect((await ledger.reserve(reservation({ amount: '1000' }), '1000')).ok).toBe(true);
    const nextDay = await ledger.reserve(
      reservation({ intentId: 'intent-2', traceId: 'trace-2', dayUtc: '2026-06-09', amount: '1000' }),
      '1000',
    );
    expect(nextDay.ok).toBe(true);
  });

  it('releaseExpired releases stale reserved rows and returns the count', async () => {
    now = 1_000;
    const stale = await ledger.reserve(reservation({ intentId: 'stale', traceId: 'trace-stale' }), '1000');
    expect(stale.ok).toBe(true);
    now = 10_000;
    const fresh = await ledger.reserve(reservation({ intentId: 'fresh', traceId: 'trace-fresh' }), '1000');
    expect(fresh.ok).toBe(true);

    const released = await ledger.releaseExpired(10_000, 5_000);
    expect(released).toBe(1);

    const afterExpiry = await ledger.reserve(
      reservation({ intentId: 'after-expiry', traceId: 'trace-after', amount: '500' }),
      '1000',
    );
    expect(afterExpiry.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test spend-ledger
```

Expected: FAIL because ledger files do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/signer-guard/src/schema.ts`:

```ts
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const signerSpendLedger = sqliteTable(
  'signer_spend_ledger',
  {
    id: text('id').primaryKey(),
    signerRole: text('signer_role').notNull(),
    signerPk: text('signer_pk').notNull(),
    token: text('token').notNull(),
    dayUtc: text('day_utc').notNull(),
    amount: text('amount').notNull(),
    status: text('status', { enum: ['reserved', 'committed', 'released'] }).notNull(),
    intentId: text('intent_id').notNull(),
    traceId: text('trace_id').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_signer_spend_intent').on(t.intentId),
    index('ix_signer_spend_day').on(t.signerRole, t.signerPk, t.token, t.dayUtc, t.status),
  ],
);

export type SignerSpendLedgerRow = typeof signerSpendLedger.$inferSelect;
```

Create `packages/signer-guard/src/db.ts`:

```ts
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type SignerGuardDb = BetterSQLite3Database<typeof schema>;

export interface SignerGuardDbHandle {
  db: SignerGuardDb;
  sqlite: Database.Database;
  close(): void;
}

const DDL = `
CREATE TABLE IF NOT EXISTS signer_spend_ledger (
  id           TEXT PRIMARY KEY,
  signer_role  TEXT NOT NULL,
  signer_pk    TEXT NOT NULL,
  token        TEXT NOT NULL,
  day_utc      TEXT NOT NULL,
  amount       TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('reserved', 'committed', 'released')),
  intent_id    TEXT NOT NULL,
  trace_id     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (intent_id)
);
CREATE INDEX IF NOT EXISTS ix_signer_spend_day
  ON signer_spend_ledger(signer_role, signer_pk, token, day_utc, status);
`;

export function openSignerGuardDb(filename = ':memory:'): SignerGuardDbHandle {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(DDL);
  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
```

Create `packages/signer-guard/src/spend-ledger.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, lte } from 'drizzle-orm';
import type { CasperPublicKeyHex, Cep18PackageHashHex } from '@caspilot/x402';
import type { SignerRole } from './types.js';
import type { SignerGuardDb } from './db.js';
import { signerSpendLedger } from './schema.js';

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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export function makeSpendLedger(db: SignerGuardDb, clock: () => number = Date.now): SpendLedger {
  return {
    async reserve(reservation, dayCapAtomic): Promise<ReserveResult> {
      return db.transaction((tx) => {
        const rows = tx
          .select({ amount: signerSpendLedger.amount })
          .from(signerSpendLedger)
          .where(
            and(
              eq(signerSpendLedger.signerRole, reservation.signerRole),
              eq(signerSpendLedger.signerPk, reservation.signerPk),
              eq(signerSpendLedger.token, reservation.token),
              eq(signerSpendLedger.dayUtc, reservation.dayUtc),
              inArray(signerSpendLedger.status, ['reserved', 'committed']),
            ),
          )
          .all();
        const spent = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
        const requested = BigInt(reservation.amount);
        if (spent + requested > BigInt(dayCapAtomic)) {
          return { ok: false, reason: 'day_cap_exceeded' };
        }

        const id = randomUUID();
        const now = clock();
        try {
          tx.insert(signerSpendLedger)
            .values({
              id,
              signerRole: reservation.signerRole,
              signerPk: reservation.signerPk,
              token: reservation.token,
              dayUtc: reservation.dayUtc,
              amount: reservation.amount,
              status: 'reserved',
              intentId: reservation.intentId,
              traceId: reservation.traceId,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        } catch (err) {
          if (isUniqueViolation(err)) return { ok: false, reason: 'reservation_conflict' };
          throw err;
        }
        return { ok: true, reservationId: id };
      });
    },

    async commit(reservationId): Promise<void> {
      db.update(signerSpendLedger)
        .set({ status: 'committed', updatedAt: clock() })
        .where(and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')))
        .run();
    },

    async release(reservationId): Promise<void> {
      db.update(signerSpendLedger)
        .set({ status: 'released', updatedAt: clock() })
        .where(and(eq(signerSpendLedger.id, reservationId), eq(signerSpendLedger.status, 'reserved')))
        .run();
    },

    async releaseExpired(nowMs, ttlMs): Promise<number> {
      const result = db
        .update(signerSpendLedger)
        .set({ status: 'released', updatedAt: nowMs })
        .where(
          and(
            eq(signerSpendLedger.status, 'reserved'),
            lte(signerSpendLedger.createdAt, nowMs - ttlMs),
          ),
        )
        .run();
      return result.changes;
    },
  };
}

export function dayUtcFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
```

Replace `packages/signer-guard/src/index.ts` with:

```ts
export * from './types.js';
export * from './config.js';
export * from './digest.js';
export * from './rules.js';
export * from './db.js';
export * from './schema.js';
export * from './spend-ledger.js';
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test spend-ledger
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: spend ledger tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/src packages/signer-guard/test/spend-ledger.test.ts
git -C /home/stardust/dev/HackQuest/caspilot commit -m "feat(signer-guard): add spend reservation ledger"
```

---

### Task 7: Add SignerGuard orchestration with fake signer success path

**Files:**
- Create: `packages/signer-guard/src/guard.ts`
- Modify: `packages/signer-guard/src/index.ts`
- Create: `packages/signer-guard/test/guard.test.ts`

- [ ] **Step 1: Write the failing success-path tests**

Create `packages/signer-guard/test/guard.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSignerGuard } from '../src/guard.js';
import { computePolicyDigest } from '../src/digest.js';
import type { RawSigner, SignRequest } from '../src/types.js';
import type { SpendLedger } from '../src/spend-ledger.js';

const RECEIVER = `00${'a'.repeat(64)}`;
const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const CONTRACT = '2'.repeat(64);
const BODY_HASH = '3'.repeat(64);
const SIGNATURE = '4'.repeat(130);

function request(overrides: Partial<SignRequest> = {}): SignRequest {
  const base: SignRequest = {
    policy: {
      signerRole: 'local_dev',
      allowedChainIds: ['casper:casper-test'],
      allowedContractPackages: [CONTRACT],
      allowedTokens: [TOKEN],
      receiverPolicy: 'allowlist',
      allowedReceivers: [RECEIVER],
      maxSinglePaymentAtomic: '500',
      perDayCapAtomic: '5000',
      requireTraceId: true,
    },
    intentId: 'intent-1',
    traceId: 'trace-1',
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    unsignedDeploy: { headerJson: { account: SIGNER_PK }, bodyHashHex: BODY_HASH, payloadHex: 'abcd' },
    intendedContractPackage: CONTRACT,
    intendedReceiver: RECEIVER,
    intendedToken: TOKEN,
    intendedAmountAtomic: '500',
    intendedChainId: 'casper:casper-test',
  };
  return { ...base, ...overrides, policy: { ...base.policy, ...overrides.policy } };
}

describe('SignerGuard.authorize', () => {
  let spendLedger: SpendLedger;
  let signer: RawSigner;

  beforeEach(() => {
    spendLedger = {
      reserve: vi.fn(async () => ({ ok: true, reservationId: 'reservation-1' })),
      commit: vi.fn(async () => {}),
      release: vi.fn(async () => {}),
      releaseExpired: vi.fn(async () => 0),
    };
    signer = {
      signerRole: 'local_dev',
      signerPk: SIGNER_PK,
      sign: vi.fn(async () => ({ signatureHex: SIGNATURE })),
    };
  });

  it('reserves spend before signing and returns the signature', async () => {
    const req = request();
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(req);

    expect(result).toEqual({
      ok: true,
      signatureHex: SIGNATURE,
      reservationId: 'reservation-1',
      policyDigest: computePolicyDigest(req.policy),
    });
    expect(spendLedger.reserve).toHaveBeenCalledWith(
      {
        signerRole: 'local_dev',
        signerPk: SIGNER_PK,
        token: TOKEN,
        dayUtc: '2024-05-29',
        amount: '500',
        intentId: 'intent-1',
        traceId: 'trace-1',
      },
      '5000',
    );
    expect(signer.sign).toHaveBeenCalledWith(req.unsignedDeploy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard
```

Expected: FAIL because `guard.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/signer-guard/src/guard.ts`:

```ts
import { computePolicyDigest } from './digest.js';
import { checkPolicyRules } from './rules.js';
import { dayUtcFromMs, type SpendLedger } from './spend-ledger.js';
import type { RawSigner, SignRequest, SignResult } from './types.js';

export interface SignerGuard {
  authorize(req: SignRequest): Promise<SignResult>;
}

export interface SignerGuardDeps {
  spendLedger: SpendLedger;
  signer: RawSigner;
  clock: () => number;
}

export function makeSignerGuard(deps: SignerGuardDeps): SignerGuard {
  return {
    async authorize(req): Promise<SignResult> {
      const policyDigest = computePolicyDigest(req.policy);
      if (
        req.policy.signerRole !== req.signerRole ||
        req.signerRole !== deps.signer.signerRole ||
        req.signerPk !== deps.signer.signerPk
      ) {
        return { ok: false, reason: 'signer_role_mismatch', policyDigest };
      }

      const denial = checkPolicyRules(req);
      if (denial) return { ok: false, reason: denial, policyDigest };

      const reserved = await deps.spendLedger.reserve(
        {
          signerRole: req.signerRole,
          signerPk: req.signerPk,
          token: req.intendedToken,
          dayUtc: dayUtcFromMs(deps.clock()),
          amount: req.intendedAmountAtomic,
          intentId: req.intentId,
          traceId: req.traceId,
        },
        req.policy.perDayCapAtomic,
      );
      if (!reserved.ok) return { ok: false, reason: reserved.reason, policyDigest };

      try {
        const signed = await deps.signer.sign(req.unsignedDeploy);
        return {
          ok: true,
          signatureHex: signed.signatureHex,
          reservationId: reserved.reservationId,
          policyDigest,
        };
      } catch {
        await deps.spendLedger.release(reserved.reservationId);
        return { ok: false, reason: 'signer_failed', policyDigest };
      }
    },
  };
}
```

Replace `packages/signer-guard/src/index.ts` with:

```ts
export * from './types.js';
export * from './config.js';
export * from './digest.js';
export * from './rules.js';
export * from './db.js';
export * from './schema.js';
export * from './spend-ledger.js';
export * from './guard.js';
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: guard success-path test passes and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/src packages/signer-guard/test/guard.test.ts
git -C /home/stardust/dev/HackQuest/caspilot commit -m "feat(signer-guard): authorize after spend reservation"
```

---

### Task 8: Add SignerGuard denial and signer-failure coverage

**Files:**
- Modify: `packages/signer-guard/test/guard.test.ts`
- Modify: `packages/signer-guard/src/guard.ts` if tests expose an orchestration bug

- [ ] **Step 1: Extend the failing tests**

Append these tests inside the existing `describe('SignerGuard.authorize', () => { ... })` block in `packages/signer-guard/test/guard.test.ts`:

```ts
  it('denies role mismatch before reserve or sign', async () => {
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request({ signerRole: 'demo_sponsored' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signer_role_mismatch');
    expect(spendLedger.reserve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('does not reserve or sign when a policy rule denies the request', async () => {
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request({ traceId: '' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('trace_id_missing');
    expect(spendLedger.reserve).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('does not sign when reservation fails', async () => {
    spendLedger.reserve = vi.fn(async () => ({ ok: false, reason: 'day_cap_exceeded' }));
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('day_cap_exceeded');
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it('releases the reservation and returns no signature when signer throws', async () => {
    signer.sign = vi.fn(async () => {
      throw new Error('signer unavailable');
    });
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    const result = await guard.authorize(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signer_failed');
    expect(spendLedger.release).toHaveBeenCalledWith('reservation-1');
    expect(result).not.toHaveProperty('signatureHex');
  });
```

- [ ] **Step 2: Run tests**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard
```

Expected: PASS if Task 7 implementation is correct; FAIL only if an orchestration bug exists.

- [ ] **Step 3: Fix orchestration if needed**

If the tests fail because `guard.ts` does not match the expected order, replace `packages/signer-guard/src/guard.ts` with the exact implementation from Task 7 Step 3.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: denial and signer-failure tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/test/guard.test.ts packages/signer-guard/src/guard.ts
git -C /home/stardust/dev/HackQuest/caspilot commit -m "test(signer-guard): cover denial and signer failure paths"
```

---

### Task 9: Add real ledger integration coverage for SignerGuard

**Files:**
- Create: `packages/signer-guard/test/guard-ledger.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `packages/signer-guard/test/guard-ledger.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SignerGuardDbHandle, openSignerGuardDb } from '../src/db.js';
import { makeSignerGuard } from '../src/guard.js';
import { makeSpendLedger } from '../src/spend-ledger.js';
import type { RawSigner, SignRequest } from '../src/types.js';

const RECEIVER = `00${'a'.repeat(64)}`;
const SIGNER_PK = `01${'c'.repeat(64)}`;
const TOKEN = '1'.repeat(64);
const CONTRACT = '2'.repeat(64);
const BODY_HASH = '3'.repeat(64);
const SIGNATURE = '4'.repeat(130);

function request(overrides: Partial<SignRequest> = {}): SignRequest {
  const base: SignRequest = {
    policy: {
      signerRole: 'local_dev',
      allowedChainIds: ['casper:casper-test'],
      allowedContractPackages: [CONTRACT],
      allowedTokens: [TOKEN],
      receiverPolicy: 'allowlist',
      allowedReceivers: [RECEIVER],
      maxSinglePaymentAtomic: '500',
      perDayCapAtomic: '500',
      requireTraceId: true,
    },
    intentId: 'intent-1',
    traceId: 'trace-1',
    signerRole: 'local_dev',
    signerPk: SIGNER_PK,
    unsignedDeploy: { headerJson: { account: SIGNER_PK }, bodyHashHex: BODY_HASH, payloadHex: 'abcd' },
    intendedContractPackage: CONTRACT,
    intendedReceiver: RECEIVER,
    intendedToken: TOKEN,
    intendedAmountAtomic: '500',
    intendedChainId: 'casper:casper-test',
  };
  return { ...base, ...overrides, policy: { ...base.policy, ...overrides.policy } };
}

describe('SignerGuard with SQLite SpendLedger', () => {
  let handle: SignerGuardDbHandle;
  let signer: RawSigner;

  beforeEach(() => {
    handle = openSignerGuardDb();
    signer = {
      signerRole: 'local_dev',
      signerPk: SIGNER_PK,
      sign: vi.fn(async () => ({ signatureHex: SIGNATURE })),
    };
  });

  afterEach(() => {
    handle.close();
  });

  it('duplicate intent id cannot reserve and sign twice', async () => {
    const spendLedger = makeSpendLedger(handle.db, () => 1_717_000_000_000);
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    expect((await guard.authorize(request())).ok).toBe(true);
    const replay = await guard.authorize(request());

    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('reservation_conflict');
    expect(signer.sign).toHaveBeenCalledTimes(1);
  });

  it('daily cap denial prevents signing', async () => {
    const spendLedger = makeSpendLedger(handle.db, () => 1_717_000_000_000);
    const guard = makeSignerGuard({ spendLedger, signer, clock: () => 1_717_000_000_000 });

    expect((await guard.authorize(request())).ok).toBe(true);
    const denied = await guard.authorize(
      request({ intentId: 'intent-2', traceId: 'trace-2', intendedAmountAtomic: '1' }),
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('amount_above_single_cap');
    expect(signer.sign).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify behavior**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard-ledger.integration
```

Expected: PASS if previous tasks are correct.

- [ ] **Step 3: Fix only if behavior diverges**

If the duplicate intent test signs twice, fix `makeSignerGuard` so it returns immediately when `reserve()` returns `{ ok: false }`. If the cap test signs twice, fix `checkPolicyRules` or `makeSpendLedger.reserve()` so denial happens before signing.

- [ ] **Step 4: Run integration test and package test**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test guard-ledger.integration
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test
```

Expected: integration test passes and all signer-guard tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add packages/signer-guard/test/guard-ledger.integration.test.ts packages/signer-guard/src
git -C /home/stardust/dev/HackQuest/caspilot commit -m "test(signer-guard): verify guard with sqlite ledger"
```

---

### Task 10: Run Phase 3 acceptance gates and update README status

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README status**

Modify the status section in `README.md` so Phase 3 is described as complete after local gates pass. Replace the current Phase 3 line:

```md
- **Phases 3–6 — not started:** SignerGuard, intent FSM + adapters + Hono API, Next.js web UI, and the Tier-1 demo harness (real on-chain proof).
```

With:

```md
- **Phase 3 — SignerGuard + SQLite spend ledger: complete.** `packages/shared` owns canonical JSON/SHA-256 helpers used by both x402 replay hashes and SignerGuard policy digests. `packages/signer-guard` provides policy parsing, deterministic `policyDigest`, deny-by-default rule checks, a SQLite `signer_spend_ledger` reservation model (`reserved`/`committed`/`released`, `UNIQUE(intent_id)`, daily cap accounting, `releaseExpired(nowMs, ttlMs)`), and a `RawSigner` interface tested with fake signers so denial paths never sign. Phase 3 intentionally does not include a real private-key signer, API/frontend routes, a background sweeper, or on-chain execution.
- **Phases 4–6 — not started:** Intent FSM + adapters + audit trace + Hono API, Next.js web UI, and the Tier-1 demo harness (real on-chain proof).
```

- [ ] **Step 2: Run focused package gates**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/shared test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/x402 test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard test
pnpm --dir /home/stardust/dev/HackQuest/caspilot --filter @caspilot/signer-guard typecheck
```

Expected: all focused tests pass; x402 still reports 150 existing tests plus the new canonical-shared test.

- [ ] **Step 3: Run workspace gates**

Run:

```bash
pnpm --dir /home/stardust/dev/HackQuest/caspilot typecheck
pnpm --dir /home/stardust/dev/HackQuest/caspilot test
pnpm --dir /home/stardust/dev/HackQuest/caspilot format:check
node /home/stardust/dev/HackQuest/caspilot/scripts/check-ci.mjs
```

Expected: all commands exit 0.

- [ ] **Step 4: Run Rust gate even though Phase 3 should not touch Rust**

Run:

```bash
node /home/stardust/dev/HackQuest/caspilot/scripts/check-cargo.mjs
```

Expected: 29 Rust tests pass and PolicyVault WASM validation still passes.

- [ ] **Step 5: Commit README acceptance note**

```bash
git -C /home/stardust/dev/HackQuest/caspilot add README.md
git -C /home/stardust/dev/HackQuest/caspilot commit -m "docs(signer-guard): record Phase 3 completion notes"
```

---

## Final self-review checklist for implementer

After Task 10, verify these invariants manually from test names and code:

- `@caspilot/x402` no longer owns canonical hashing implementation.
- `@caspilot/shared` canonical helper behavior matches the previous x402 helper behavior.
- `@caspilot/signer-guard` does not import or load private keys.
- `RawSigner` is only an interface in Phase 3.
- `makeSignerGuard()` checks role mismatch before reservation.
- `makeSignerGuard()` checks policy rules before reservation.
- `makeSignerGuard()` reserves spend before signing.
- Denial paths do not call `RawSigner.sign()`.
- Signer failure releases the reservation and returns no signature bytes.
- `releaseExpired(nowMs, ttlMs)` exists and has tests, but no timer or background worker exists.
- No files under `apps/` or `contracts/policy-vault/` changed.

## Execution notes

Use one commit per task. If a test unexpectedly passes before implementation, inspect whether previous tasks already covered that behavior and still keep the commit scoped. If a command fails for an environment reason, record the exact command and error in the handoff before changing scope.
