# Caspilot — Design Spec

| Field    | Value |
|----------|-------|
| Date     | 2026-06-05 |
| Event    | Casper Agentic Buildathon 2026 (DoraHacks; submission deadline 2026-06-30) |
| Author   | Solo |
| Status   | Design approved (§1–§3B); ready for implementation plan |
| Scope    | Sections §1 (product), §2 (architecture), §3A (executable specs), §3B (code interfaces + tests-first). Implementation lives in the follow-on plan, not here. |

> Tracks targeted (primary, primary, optional): **Agentic AI**, **DeFi and Payments**, **Cross-Chain** via x402.

---

## §1 — Product Definition

### 1.1 What Caspilot is

Caspilot is an autonomous DeFi-yield agent on Casper Network, packaged as two product lines that share one backend:

1. **Public x402-paid agent endpoint** — pay-per-call HTTP API. Caller posts a yield goal + constraints, gets back a structured plan (quote + policy-validated, signer-ready). Settlement is x402 on a CEP-18 token via the official facilitator.
2. **Delegated PolicyVault** — Casper smart contract that holds a small CEP-18 budget on the user's behalf. Configurable allowlists (agents, receivers) and limits (per-payment, daily, validity window). Agent operates within those limits without ever holding the user's private key.

### 1.2 Why two product lines

- Single line = either (a) "free agent demo" with no payment story, or (b) "paid API with no on-chain enforcement story." Both are weak for the prize criteria.
- Two lines hit Agentic AI (planner + tool use), DeFi and Payments (x402 + CEP-18 vault), and surface Cross-Chain (x402 is chain-agnostic by spec) without overcommitting.

### 1.3 What Caspilot is NOT

- Not a wallet. Not a custodian. Never stores user private keys.
- Not a generic AI assistant. Caspilot has one job: yield planning + bounded execution within delegated authority.
- Not a self-funded mainnet operation. Sponsored testnet by default; sponsored mainnet only where the buildathon explicitly enables it.
- Not native-CSPR x402. Casper x402 reference uses CEP-18 + EIP-712 `transfer_with_authorization`-style signed authorization. That's the only x402 path we implement.

---

## §2 — System Architecture

### 2.1 Topology

Monorepo:

```
caspilot/
├── apps/
│   ├── web/                 # Next.js + Tailwind, CSPR.click integration
│   └── api/                 # Hono on Node, single instance, SQLite + WAL
├── contracts/
│   └── policy-vault/        # Rust + Odra
├── packages/
│   ├── shared/              # branded types, intent FSM, canonical-json
│   ├── x402-gateway/        # facilitator client, schemas, replay ledger glue
│   ├── adapters/            # Casper RPC, CSPR.cloud, CSPR.trade (MCP/SDK), CEP-18
│   ├── signer-guard/        # allowlists + spend-reservation ledger
│   ├── payment-ledger/      # x402 replay protection
│   ├── audit-trace/         # internal vs public export shapes
│   └── agent-core/          # planner only, no execution authority
├── scripts/
│   ├── adapter-doctor.ts    # boot capability report
│   ├── deploy-vault.ts
│   ├── seed-demo.ts
│   ├── dry-run.ts
│   └── demo-tier1.test.ts   # end-to-end Tier 1 harness
└── docs/superpowers/specs/  # this doc lives here
```

### 2.2 Trust boundaries

- **Three signer roles, never merged:**
  - `user_cspr_click` — CSPR.click in the browser (user-driven flows).
  - `local_dev` — env-keyed dev signer (dev mode only).
  - `demo_sponsored` — low-balance signer for self-driven testnet/mainnet_sponsored demo flows.
- **API never stores user private keys.** `packages/signer-guard` enforces token / contract / amount / network / trace-id allowlists before any signer signs anything. No bypass.
- **Frontend never holds CSPR.cloud API keys.** It uses the CSPR.click cloud proxy only for limited read-only methods. All privileged CSPR.cloud reads/writes go through the Caspilot API.

### 2.3 Modes

| Dimension | Values |
|---|---|
| `paymentMode` | `none`, `x402_mock`, `x402_simulate`, `x402_testnet`, `x402_mainnet_sponsored` |
| `executionMode` | `dry_run`, `simulate`, `testnet`, `mainnet_sponsored` |
| `chainId` | `casper:<chainspec_name>`, asserted at boot against `info_get_status.chainspec_name` |

### 2.4 PolicyVault enforcement scope (honesty)

On-chain policy can **only** enforce constraints on assets/actions that flow through the vault. `CSPR.trade build_swap → sign_deploy → submit_transaction` is signer-controlled; PolicyVault cannot constrain arbitrary EOA-signed deploys unless funds/actions are routed through the vault. MVP scope: PolicyVault controls a small CEP-18 / x402 spending budget with agent allowlist, receiver allowlist, `max_single_payment`, `daily_limit`, `valid_until`. Nothing bigger until verified.

### 2.5 Non-goals

Complex DEX routing, MEV protection, non-Casper chains beyond x402 spec compatibility, mobile app, multi-user scaling beyond hackathon scope, raw chain-of-thought storage.

---

## §3A — Executable Specs & Interfaces

### §3A.0 — Shared Conventions & Casper Types

```ts
// packages/shared/src/casper-types.ts

/** 64 lowercase hex chars. No prefix. Generic raw 32-byte digest/hash. */
export type Hex64 = string & { readonly __brand: 'Hex64' };

/** Casper account address — MVP / x402 wire form: "00" + 64 hex. */
export type CasperAccountAddressHex = string & { readonly __brand: 'CasperAccountAddressHex' };

/** Algorithm-prefixed PublicKey:
 *   - "01" + 64 hex   → Ed25519
 *   - "02" + 66 hex   → Secp256k1 */
export type CasperPublicKeyHex = string & { readonly __brand: 'CasperPublicKeyHex' };

/** "account-hash-<64 hex>" — derived account-hash key form. */
export type CasperAccountHashKey = `account-hash-${string}` & { readonly __brand: 'AccountHashKey' };

/** "hash-<64 hex>" — global state key for stored contract/package by hash. */
export type CasperStoredKeyHash = `hash-${string}` & { readonly __brand: 'StoredKeyHash' };

/** "contract-package-<64 hex>" — explicit package key form. */
export type CasperContractPackageKey = `contract-package-${string}` & { readonly __brand: 'ContractPackageKey' };

/** Raw 64-char hex CEP-18 contract package hash. */
export type Cep18PackageHashHex = Hex64;

/** CAIP-2: "casper:<chainspec_name>". Chainspec name is asserted at boot. */
export type CasperCaip2ChainId = `casper:${string}` & { readonly __brand: 'CasperCaip2' };

// Conversion helpers — bodies in §3B
export function hex64ToStoredKey(h: Hex64): CasperStoredKeyHash;
export function hex64ToPackageKey(h: Hex64): CasperContractPackageKey;
export function publicKeyHexToAccountHash(pk: CasperPublicKeyHex): CasperAccountHashKey;
export function assertHex64(s: string): Hex64;
export function assertCasperAccountAddressHex(s: string): CasperAccountAddressHex;
```

**Hard rule:** x402 `payTo`/`from`/`to` take `CasperAccountAddressHex`; `asset` takes `Cep18PackageHashHex`. Passing any prefixed key form into x402 config is a type error AND a runtime reject.

**Boot assertion:** `adapter-doctor` and API startup call `casper_rpc.info_get_status()` and verify `result.chainspec_name === parseCaip2(chainId).chainspecName`. Mismatch → boot fails, no `EXECUTED`-eligible mode.

### §3A.1 — x402 Gateway Interface

#### Header & error vocabulary

```ts
export const X402_PAYMENT_HEADER = 'PAYMENT-SIGNATURE' as const;

export type X402ErrorReason =
  | 'invalid_payload'   | 'invalid_scheme'   | 'invalid_network' | 'invalid_asset'
  | 'invalid_amount'    | 'expired'          | 'insufficient_funds'
  | 'replay_detected'   | 'signature_invalid'| 'unsupported_kind'| 'facilitator_unavailable';
```

#### Asset config (`cep18-x402` kind)

```ts
export interface Cep18X402AssetConfig {
  kind: 'cep18-x402';
  chainId: CasperCaip2ChainId;
  asset: Cep18PackageHashHex;
  receiver: CasperAccountAddressHex;
  name: string;                     // EIP-712 domain.name
  version: string;                  // EIP-712 domain.version
  decimals: number;
  minPaymentAtomic: string;
  maxPaymentAtomic: string;
  maxTimeoutSeconds: number;
  requiresEntryPoint: 'transfer_with_authorization';
}

export interface X402GatewayConfig {
  facilitatorUrl: string;
  facilitatorApiKey?: string;        // env-only
  mode: 'mock' | 'simulate' | 'testnet' | 'mainnet_sponsored';
  assets: Cep18X402AssetConfig[];
}
```

#### Replay model

Gateway does NOT allocate nonces. Client generates a 32-byte nonce. On verify+settle, gateway hashes the canonical JSON of `payload.authorization` → stores `(nonce, payload_hash, payer, asset)` in `payment_ledger` with `UNIQUE(nonce, payer, asset)` + `UNIQUE(payload_hash)`. Duplicate → `replay_detected`.

The locked schemas (Zod, with parsed types) and fixtures for this interface are in §3B.0 / §3B.1.

### §3A.2 — PolicyVault Odra ABI

```rust
// contracts/policy-vault/src/lib.rs

use odra::prelude::*;
use odra::{Address, Var, Mapping};
use odra::casper_types::U256;

#[odra::odra_error]
pub enum PolicyVaultError {
    NotOwner = 1,
    AgentNotAllowed = 2,
    ReceiverNotAllowed = 3,
    AmountAboveMax = 4,
    DayLimitExceeded = 5,
    VaultExpired = 6,
    NonceAlreadyUsed = 7,
    InsufficientVaultBalance = 8,
    ArithmeticOverflow = 9,
    InvalidValidUntil = 10,
    Cep18CallFailed = 11, // Reserved for future non-reverting CEP-18 adapter paths; unused by Odra 2.0 generated refs.
}

#[odra::event] pub struct VaultConfigured { pub owner: Address, pub token_package: Address, pub valid_until_ms: u64 }
#[odra::event] pub struct AgentAllowed     { pub agent: Address }
#[odra::event] pub struct AgentRevoked     { pub agent: Address }
#[odra::event] pub struct ReceiverAllowed  { pub receiver: Address }
#[odra::event] pub struct ReceiverRevoked  { pub receiver: Address }
#[odra::event] pub struct LimitsUpdated    { pub max_single: U256, pub daily_limit: U256 }
#[odra::event] pub struct ValidUntilSet    { pub valid_until_ms: u64 }
#[odra::event] pub struct Expired          {}
#[odra::event] pub struct Paid             {
    pub agent: Address,
    pub receiver: Address,
    pub amount: U256,
    pub payload_hash: [u8; 32],
    pub paid_total_after: U256,
}

#[odra::module(events = [
    VaultConfigured, AgentAllowed, AgentRevoked,
    ReceiverAllowed, ReceiverRevoked, LimitsUpdated,
    ValidUntilSet, Expired, Paid
], errors = PolicyVaultError)]
pub struct PolicyVault {
    owner: Var<Address>,
    token_package: Var<Address>,
    agents: Mapping<Address, bool>,
    receivers: Mapping<Address, bool>,
    max_single: Var<U256>,
    daily_limit: Var<U256>,
    valid_until_ms: Var<u64>,        // env.get_block_time() is ms
    day_index: Var<u64>,             // block_time_ms / 86_400_000
    day_spend: Var<U256>,
    paid_total: Var<U256>,
    used_payload_hashes: Mapping<[u8; 32], bool>,
}

#[odra::module]
impl PolicyVault {
    pub fn init(&mut self, token_package: Address, max_single: U256, daily_limit: U256, valid_until_ms: u64);

    // Owner-only admin
    pub fn allow_agent(&mut self, agent: Address);
    pub fn revoke_agent(&mut self, agent: Address);
    pub fn allow_receiver(&mut self, receiver: Address);
    pub fn revoke_receiver(&mut self, receiver: Address);
    pub fn set_limits(&mut self, max_single: U256, daily_limit: U256);

    pub fn set_valid_until(&mut self, new_valid_until_ms: u64);
    pub fn expire_now(&mut self);

    pub fn pay(&mut self, receiver: Address, amount: U256, payload_hash: [u8; 32]);

    // Views
    pub fn get_owner(&self) -> Address;
    pub fn get_token_package(&self) -> Address;
    pub fn is_agent(&self, who: Address) -> bool;
    pub fn is_receiver_allowed(&self, who: Address) -> bool;
    pub fn get_limits(&self) -> (U256, U256);
    pub fn get_valid_until_ms(&self) -> u64;
    pub fn get_day_state(&self) -> (u64, U256, U256);
    pub fn is_payload_used(&self, payload_hash: [u8; 32]) -> bool;
}
```

**`pay` policy:**

1. `caller ∈ agents` else `AgentNotAllowed`.
2. `receivers.get(receiver) == true` else `ReceiverNotAllowed`.
3. `now_ms < valid_until_ms` else `VaultExpired`.
4. `amount <= max_single` else `AmountAboveMax`.
5. Day rollover: `new_day = now_ms / 86_400_000`; if `new_day != day_index` reset `day_spend = 0`, `day_index = new_day`.
6. `new_day_spend = day_spend.checked_add(amount).ok_or(ArithmeticOverflow)?`; require `new_day_spend <= daily_limit` else `DayLimitExceeded`.
7. `!used_payload_hashes.get(payload_hash)` else `NonceAlreadyUsed`.
8. Self-balance ≥ amount via CEP-18 `balance_of(self)` else `InsufficientVaultBalance`.
9. Cross-contract call CEP-18 `transfer(receiver, amount)`. Under Odra 2.0, generated cross-contract refs propagate CEP-18 callee failures directly; PolicyVault does not catch/map them to `PolicyVaultError::Cep18CallFailed`.
10. Checked add `paid_total` before the external call; commit `day_spend`, `paid_total`, and `used_payload_hashes[payload_hash] = true` only after transfer succeeds; emit `Paid`.

**Odra 2.0 cross-contract failure behavior:** CEP-18 transfer failures propagate the CEP-18 error code directly because generated `ContractRef` calls revert on callee failure and do not expose an in-contract `OdraResult`. PolicyVault's required guarantee is accounting safety: when the CEP-18 transfer reverts, `day_spend`, `paid_total`, and `used_payload_hashes` must remain unchanged. `Cep18CallFailed` remains reserved for a future lower-level/non-reverting adapter path, but is currently unused by the Odra 2.0 generated-ref implementation.

**CEP-18 external interface (declared explicit, asserted at boot):**

```rust
pub trait Cep18 {
    fn transfer(&mut self, recipient: Address, amount: U256);
    fn balance_of(&self, account: Address) -> U256;
    fn decimals(&self) -> u8;
    fn symbol(&self) -> String;
    fn name(&self) -> String;
}
```

### §3A.3 — Intent State Machine & API

```ts
export type IntentState =
  | 'DRAFT'
  | 'POLICY_VALIDATED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_VERIFIED'
  | 'READY_TO_SUBMIT'
  | 'SIGNED_RECEIVED'         // gateway has signed deploy bytes
  | 'ACCEPTED_BY_NODE'        // node returned deploy_hash
  | 'EXECUTED'                // observed in a block with execution_result
  | 'FINALIZED'               // past finality threshold (optional)
  | 'EXECUTION_FAILED'        // accepted but execution_result = Failure
  | 'REJECTED'                // node refused outright
  | 'TIMEOUT';                // observation window elapsed

export type PaymentMode =
  | 'none' | 'x402_mock' | 'x402_simulate' | 'x402_testnet' | 'x402_mainnet_sponsored';

export type ExecutionMode = 'dry_run' | 'simulate' | 'testnet' | 'mainnet_sponsored';

export interface IntentRecord {
  id: string;                 // ULID
  state: IntentState;
  paymentMode: PaymentMode;
  executionMode: ExecutionMode;
  chainId: CasperCaip2ChainId;
  source: {
    type: 'public_x402' | 'delegated_vault';
    strategyId?: string;
    promptDigest: Hex64;
  };
  policyDigest?: Hex64;       // optional until POLICY_VALIDATED
  payment?: {
    requirements: PaymentRequirements;
    payloadDigest: Hex64;
    settleDeployHash?: Hex64;
  };
  execution?: {
    deployHash?: Hex64;
    blockHeight?: number;
    executionResult?: 'success' | 'failure';
    errorCode?: string;
  };
  createdAtMs: number;
  updatedAtMs: number;
}
```

**TIMEOUT ≠ failure.** UI surfaces it as "unknown — verify on explorer," with `/attach-deploy-hash` as the manual recovery affordance.

| Method | Path | Pre-state | Post-state on success |
|---|---|---|---|
| POST | `/intents` | — | `DRAFT` |
| POST | `/intents/:id/plan` | `DRAFT` | `DRAFT` (+ plan attached) |
| POST | `/intents/:id/validate-policy` | `DRAFT` | `POLICY_VALIDATED` |
| POST | `/intents/:id/require-payment` | `POLICY_VALIDATED` | `PAYMENT_REQUIRED` |
| POST | `/intents/:id/verify-payment` | `PAYMENT_REQUIRED` | `PAYMENT_VERIFIED` |
| POST | `/intents/:id/settle-payment` | `PAYMENT_VERIFIED` | `READY_TO_SUBMIT` |
| POST | `/intents/:id/sign` | `READY_TO_SUBMIT` | `SIGNED_RECEIVED` |
| POST | `/intents/:id/submit` | `SIGNED_RECEIVED` | `ACCEPTED_BY_NODE` \| `REJECTED` |
| POST | `/intents/:id/observe` | `ACCEPTED_BY_NODE` | `EXECUTED` \| `EXECUTION_FAILED` \| `TIMEOUT` |
| POST | `/intents/:id/finalize` | `EXECUTED` | `FINALIZED` |
| POST | `/intents/:id/attach-deploy-hash` | `SIGNED_RECEIVED` \| `TIMEOUT` | `ACCEPTED_BY_NODE` |
| POST | `/intents/:id/cancel` | non-terminal | `REJECTED` |
| GET  | `/intents/:id` | any | — |

### §3A.4 — CSPR.trade & Swap Adapter

```ts
export type AssetRef =
  | { kind: 'native_cspr' }
  | { kind: 'cep18'; packageHash: Cep18PackageHashHex }
  | { kind: 'cspr_trade_symbol'; symbol: string };

export interface QuoteRequest {
  from: AssetRef;
  to: AssetRef;
  amountIn: string;
  signerPublicKey: CasperPublicKeyHex;
  account?: CasperAccountAddressHex;
  slippageBps: number;
  deadlineUnixSec: number;
}

export interface QuoteResponse {
  amountOut: string;
  route: unknown;
  expiresAtUnixSec: number;
  provenance: 'cspr_trade_mcp' | 'cspr_trade_sdk';
}

export interface BuildSwapDeployRequest extends QuoteRequest { quote: QuoteResponse; }

export interface BuildSwapDeployResponse {
  unsignedDeploy: { headerJson: unknown; bodyHashHex: Hex64; payloadHex: string };
}

export interface SwapAdapter {
  quote(req: QuoteRequest): Promise<QuoteResponse>;
  buildSwapDeploy(req: BuildSwapDeployRequest): Promise<BuildSwapDeployResponse>;
}
```

MVP scope is quote + policy-validate + return unsigned deploy. Real swap settlement is **stretch (Tier 3)**.

### §3A.5 — SignerGuard Policy

```ts
export type ReceiverPolicy = 'deny_all' | 'allowlist' | 'allow_any_with_manual_approval';

export interface SignerGuardPolicy {
  signerRole: 'user_cspr_click' | 'local_dev' | 'demo_sponsored';
  allowedChainIds: CasperCaip2ChainId[];          // empty = deny-all
  allowedContractPackages: Cep18PackageHashHex[]; // empty = deny-all
  allowedTokens: Cep18PackageHashHex[];           // empty = deny-all
  receiverPolicy: ReceiverPolicy;
  allowedReceivers: CasperAccountAddressHex[];    // empty = deny-all
  maxSinglePaymentAtomic: string;
  perDayCapAtomic: string;
  requireTraceId: boolean;
}

export interface SignRequest {
  policy: SignerGuardPolicy;
  intentId: string;
  traceId: string;
  unsignedDeploy: { headerJson: unknown; bodyHashHex: Hex64; payloadHex: string };
  intendedReceiver: CasperAccountAddressHex;
  intendedToken: Cep18PackageHashHex;
  intendedAmountAtomic: string;
  intendedChainId: CasperCaip2ChainId;
}

export type SignDenial =
  | 'chain_not_allowed' | 'package_not_allowed' | 'token_not_allowed'
  | 'receiver_not_allowed' | 'amount_above_single_cap' | 'day_cap_exceeded'
  | 'trace_id_missing' | 'reservation_conflict';

export type SignResult =
  | { ok: true; signatureHex: string }
  | { ok: false; reason: SignDenial };
```

**`signer_spend_ledger` (reservation model):**

```sql
CREATE TABLE signer_spend_ledger (
  id           TEXT PRIMARY KEY,
  signer_role  TEXT NOT NULL,
  signer_pk    TEXT NOT NULL,           -- CasperPublicKeyHex
  token        TEXT NOT NULL,           -- Cep18PackageHashHex
  day_utc      TEXT NOT NULL,           -- "YYYY-MM-DD"
  amount       TEXT NOT NULL,
  status       TEXT NOT NULL,           -- 'reserved' | 'committed' | 'released'
  intent_id    TEXT NOT NULL,
  trace_id     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (intent_id)
);
CREATE INDEX ix_sl_day ON signer_spend_ledger(signer_role, signer_pk, token, day_utc, status);
```

Sign flow: open txn → SUM(reserved+committed) for (signer, token, day_utc) → reject if SUM+amount > perDayCap → INSERT `reserved` row → release on denial OR commit on `EXECUTED` / release on `REJECTED|TIMEOUT-after-window`.

**`policyDigest`:** canonical JSON (sorted keys, no whitespace, atomic amounts as strings, arrays preserve order) → SHA-256.

### §3A.6 — Adapter Capability & Boot

```ts
export type AdapterTier =
  | 'boot'           // required for API to come up
  | 'chain_status'   // any of: casper_rpc | cspr_cloud_rest | cspr_cloud_streaming
  | 'db'             // sqlite writable
  | 'observation'    // observe deploy_hash → block / execution_result
  | 'strategy'       // x402-paid endpoint
  | 'dex'            // CSPR.trade — stretch
  | 'submission';    // submit signed deploy

export interface AdapterStatus {
  name: string;
  tier: AdapterTier;
  ok: boolean;
  detail?: string;
  chainspecName?: string;
}

export interface CapabilityBootReport {
  startedAtMs: number;
  chainId: CasperCaip2ChainId;
  adapters: AdapterStatus[];
  bootSatisfied: boolean;                 // ≥1 chain_status OK && db OK
  modesEnabled: { payment: PaymentMode[]; execution: ExecutionMode[] };
}
```

**Boot rule:** API boots iff `db.ok && adapters.some(a => a.tier === 'chain_status' && a.ok && a.chainspecName === parseCaip2(chainId).chainspecName)`. Missing `dex` → DeFi swap endpoints return `503 adapter_unavailable`; API and x402-paid endpoint stay up. Missing `submission` while `observation` OK → users can `/attach-deploy-hash` manually.

### §3A.7 — AuditTrace

```ts
export interface AuditTraceInternal {
  traceId: string;                       // ULID
  intentId: string;
  chainId: CasperCaip2ChainId;
  createdAtMs: number;

  // Full on-chain refs — kept internally
  vaultPackageHash?: Cep18PackageHashHex;
  tokenPackageHash?: Cep18PackageHashHex;
  paymentDeployHash?: Hex64;
  executionDeployHash?: Hex64;
  payerAccount?: CasperAccountAddressHex;
  receiverAccount?: CasperAccountAddressHex;

  // Structured planner output — no raw CoT
  plannerOutput: {
    goalDigest: Hex64;
    chosenStrategyId?: string;
    constraintsApplied: string[];        // policy-rule names
    toolCalls: Array<{ tool: string; argDigest: Hex64; outDigest: Hex64; ok: boolean }>;
    decisionsRedactedSummary: string;    // ≤ 400 chars
  };

  policyChecks: Array<{ rule: string; passed: boolean; reason?: string }>;
  paymentStatus: 'none' | 'verified' | 'settled' | 'failed';
  executionStatus: IntentState;
}

export interface AuditTracePublicExport {
  traceId: string;
  intentId: string;
  chainId: CasperCaip2ChainId;
  createdAtMs: number;
  paymentDeployHash?: Hex64;
  executionDeployHash?: Hex64;
  vaultPackageHash?: Cep18PackageHashHex;
  // payerAccount, receiverAccount OMITTED
  plannerOutput: {
    chosenStrategyId?: string;
    constraintsApplied: string[];
    toolCallsCount: number;
    decisionsRedactedSummary: string;
  };
  policyChecks: Array<{ rule: string; passed: boolean }>;
  paymentStatus: AuditTraceInternal['paymentStatus'];
  executionStatus: IntentState;
}
```

**Never stored, anywhere:** raw prompt, raw model response, chain-of-thought, private keys, raw env, raw facilitator API key, raw CSPR.cloud key.

### §3A.8 — Demo Acceptance Criteria

**Tier 1 — MUST (PolicyVault real on-chain proof):**

- PolicyVault deployed on testnet; deploy hash + package hash published.
- One real `pay` call succeeds, observed in a block. Explorer link in audit-trace public export.
- One rejected policy call with evidence: either API pre-sign rejection trace, OR on-chain `EXECUTION_FAILED` with `PolicyVaultError` code. Both pathways count.

**Tier 2 — STRONGLY ENCOURAGED (x402 real settlement):**

- A `Cep18X402`-compatible token (must expose `transfer_with_authorization`) deployed or selected on testnet; package hash published.
- One real x402 `/settle` succeeds against the live facilitator; deploy hash in `payment.settleDeployHash`.

**Tier 3 — STRETCH (CSPR.trade real swap):**

- One real swap deploy signed (user or local dev signer) and observed `EXECUTED`. Quote + policy-validate alone is NOT enough.

A demo with zero on-chain artifacts is **not acceptable.**

---

## §3B — Code-level Interfaces & Tests First

### §3B.0 — x402 Official Wire Types (LOCKED)

> Source of truth: Casper x402 API reference. Supersedes any earlier wire-type sketches. Any code that doesn't import from `packages/x402-gateway/src/schemas/*` is wrong.

**Schema file layout:**

```
packages/x402-gateway/src/schemas/
├── primitives.schema.ts
├── payment-payload.schema.ts
├── payment-requirements.schema.ts
├── verify.schema.ts                  # WireVerifyResponse + NormalizedVerifyResponse
├── settle.schema.ts                  # WireSettleResponse + NormalizedSettleResponse
├── supported.schema.ts
├── errors.schema.ts
├── normalize.ts                      # wire → normalized helpers
└── index.ts
```

#### `primitives.schema.ts`

```ts
import { z } from 'zod';

export const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** MVP / x402 wire form: "00" + 64 hex. */
export const CasperAccountAddressHex = z.string().regex(/^00[0-9a-f]{64}$/);

/** Algo-prefixed PublicKey. */
export const CasperPublicKeyHex = z.string().regex(/^(01[0-9a-f]{64}|02[0-9a-f]{66})$/);

/** Exactly 130 hex chars; no prefix enforcement until Go fixture pins it. */
export const CasperSignatureHex = z.string().regex(/^[0-9a-f]{130}$/);

export const Cep18PackageHashHex = Hex64;
export const CasperCaip2ChainId  = z.string().regex(/^casper:[A-Za-z0-9_-]+$/);
export const AtomicDecimalString = z.string().regex(/^\d+$/);
export const UnixSecondsString   = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]);

/** Accepts both:
 *    /supported extra.decimals  → number  (9)
 *    /verify  requirements.decimals → string  ("9")
 *  Normalize internally via decimalsToNumber(). */
export const DecimalsField = z.union([
  z.number().int().min(0).max(38),
  z.string().regex(/^\d+$/),
]);
export type DecimalsWire = z.infer<typeof DecimalsField>;
export function decimalsToNumber(d: DecimalsWire): number {
  return typeof d === 'number' ? d : parseInt(d, 10);
}

export const X402Version = z.literal(2);
export const X402Scheme  = z.literal('exact');
```

#### `payment-payload.schema.ts`

```ts
export const AuthorizationSchema = z.object({
  from:        CasperAccountAddressHex,
  to:          CasperAccountAddressHex,
  value:       AtomicDecimalString,
  validAfter:  UnixSecondsString,
  validBefore: UnixSecondsString,
  nonce:       Hex64,
}).strict();

export const PaymentPayloadSchema = z.object({
  x402Version: X402Version,
  scheme:      X402Scheme,
  network:     CasperCaip2ChainId,
  payload: z.object({
    signature:     CasperSignatureHex,
    publicKey:     CasperPublicKeyHex,
    authorization: AuthorizationSchema,
  }).strict(),
}).strict();
```

#### `payment-requirements.schema.ts`

```ts
export const PaymentRequirementsSchema = z.object({
  scheme:   X402Scheme,
  network:  CasperCaip2ChainId,
  payTo:    CasperAccountAddressHex,
  amount:   AtomicDecimalString,
  asset:    Cep18PackageHashHex,
  extra: z.object({
    name:     z.string().min(1),
    version:  z.string().min(1),
    decimals: DecimalsField,
  }).strict(),
  maxTimeoutSeconds: z.number().int().positive(),
}).strict();
```

#### `supported.schema.ts`

```ts
export const SupportedKindSchema = z.object({
  x402Version: X402Version,
  scheme:      X402Scheme,
  network:     CasperCaip2ChainId,
  extra: z.object({
    feePayer: CasperAccountAddressHex,
    decimals: DecimalsField,
    name:     z.string().min(1),
    version:  z.string().min(1),
  }).strict(),
}).strict();

export const SupportedResponseSchema = z.object({ kinds: z.array(SupportedKindSchema) }).strict();
```

#### `verify.schema.ts` — Wire + Normalized

```ts
export const VerifyRequestSchema = z.object({
  paymentPayload:      PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
}).strict();

/** Wire shape (facilitator may include payer on success). */
export const WireVerifyResponseSchema = z.discriminatedUnion('isValid', [
  z.object({
    isValid: z.literal(true),
    payer:   CasperAccountAddressHex.optional(),
  }).strict(),
  z.object({
    isValid: z.literal(false),
    invalidReason: X402ErrorReasonSchema,
  }).strict(),
]);

/** Normalized shape returned to our gateway callers — payer always present
 *  on success because we cross-fill from PaymentPayload.payload.authorization.from
 *  if the wire response omits it. */
export const NormalizedVerifyResponseSchema = z.discriminatedUnion('isValid', [
  z.object({
    isValid: z.literal(true),
    payer:   CasperAccountAddressHex,                 // required after normalize
  }).strict(),
  z.object({
    isValid: z.literal(false),
    invalidReason: X402ErrorReasonSchema,
  }).strict(),
]);
```

#### `settle.schema.ts` — Wire + Normalized

```ts
export const SettleRequestSchema = VerifyRequestSchema;

/** Wire shape (matches facilitator HTTP response):
 *    transaction is a bare deploy-hash string, alongside network and payer. */
export const WireSettleResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success:     z.literal(true),
    network:     CasperCaip2ChainId,
    transaction: Hex64,                                // bare deploy hash
    payer:       CasperAccountAddressHex,
  }).strict(),
  z.object({
    success:     z.literal(false),
    errorReason: X402ErrorReasonSchema,
  }).strict(),
]);

/** Normalized shape used internally and returned by our gateway. */
export const NormalizedSettleResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    transaction: z.object({
      chainId:    CasperCaip2ChainId,
      deployHash: Hex64,
    }).strict(),
    payer: CasperAccountAddressHex,
  }).strict(),
  z.object({
    success:     z.literal(false),
    errorReason: X402ErrorReasonSchema,
  }).strict(),
]);
```

#### `normalize.ts`

```ts
import type { z } from 'zod';

export function normalizeVerifyResponse(
  wire: z.infer<typeof WireVerifyResponseSchema>,
  fallbackPayer: CasperAccountAddressHex,    // payload.payload.authorization.from
): z.infer<typeof NormalizedVerifyResponseSchema> {
  // body in §3B implementation phase
}

export function normalizeSettleResponse(
  wire: z.infer<typeof WireSettleResponseSchema>,
): z.infer<typeof NormalizedSettleResponseSchema> {
  // body in §3B implementation phase
}
```

#### `errors.schema.ts`

```ts
export const X402ErrorReasonSchema = z.enum([
  'invalid_payload', 'invalid_scheme', 'invalid_network', 'invalid_asset',
  'invalid_amount', 'expired', 'insufficient_funds', 'replay_detected',
  'signature_invalid', 'unsupported_kind', 'facilitator_unavailable',
]);
```

#### PAYMENT-SIGNATURE header

```ts
export const X402_HEADER = 'PAYMENT-SIGNATURE' as const;

export interface PaymentSignatureHeaderCodec {
  encode(payload: PaymentPayload): string;            // base64url(JSON.stringify(payload)), no padding
  decode(headerValue: string): PaymentPayload;        // throws on schema fail
  safeDecode(headerValue: string):
    | { ok: true; payload: PaymentPayload }
    | { ok: false; reason: 'invalid_payload' };
}
```

### §3B.1 — Fixtures

```
packages/x402-gateway/__fixtures__/
├── supported-response.json
├── verify-request.exact-casper.json
├── settle-response-success.wire.json
├── settle-response-success.normalized.json
├── settle-response-failure.json
├── verify-response-success.wire.with-payer.json
├── verify-response-success.wire.no-payer.json
├── payment-signature-header.exact-casper.txt
├── payment-payload.expired.json
├── payment-payload.bad-network.json
├── payment-payload.invalid-account-address.json     # negative: from = 01... (publicKey form)
└── payment-payload.replay-duplicate.json
```

#### `verify-request.exact-casper.json`

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "casper:casper-test",
    "payload": {
      "signature": "a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0f1f2",
      "publicKey": "01deadbeefcafebabe0000000000000000000000000000000000000000000000aa",
      "authorization": {
        "from":        "00deadbeefcafebabe0000000000000000000000000000000000000000000000aa",
        "to":          "00feedfacefeedface0000000000000000000000000000000000000000000000bb",
        "value":       "1000000000",
        "validAfter":  "1717000000",
        "validBefore": "1717003600",
        "nonce":       "11112222333344445555666677778888aaaabbbbccccddddeeeeffff00001111"
      }
    }
  },
  "paymentRequirements": {
    "scheme":  "exact",
    "network": "casper:casper-test",
    "payTo":   "00feedfacefeedface0000000000000000000000000000000000000000000000bb",
    "amount":  "1000000000",
    "asset":   "abcd0000000000000000000000000000000000000000000000000000000000ff",
    "extra":   { "name": "Cep18X402Demo", "version": "1", "decimals": "9" },
    "maxTimeoutSeconds": 60
  }
}
```

#### `supported-response.json`

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "casper:casper-test",
      "extra": {
        "feePayer": "00cafef00dcafef00d0000000000000000000000000000000000000000000000ff",
        "decimals": 9,
        "name": "Cep18X402Demo",
        "version": "1"
      }
    }
  ]
}
```

#### `settle-response-success.wire.json`

```json
{
  "success": true,
  "network": "casper:casper-test",
  "transaction": "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
  "payer": "00deadbeefcafebabe0000000000000000000000000000000000000000000000aa"
}
```

#### `settle-response-success.normalized.json`

```json
{
  "success": true,
  "transaction": {
    "chainId": "casper:casper-test",
    "deployHash": "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b"
  },
  "payer": "00deadbeefcafebabe0000000000000000000000000000000000000000000000aa"
}
```

#### `settle-response-failure.json`

```json
{ "success": false, "errorReason": "replay_detected" }
```

#### `verify-response-success.wire.with-payer.json`

```json
{ "isValid": true, "payer": "00deadbeefcafebabe0000000000000000000000000000000000000000000000aa" }
```

#### `verify-response-success.wire.no-payer.json`

```json
{ "isValid": true }
```

#### `payment-payload.invalid-account-address.json`

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "casper:casper-test",
  "payload": {
    "signature": "a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0f1f2",
    "publicKey": "01deadbeefcafebabe0000000000000000000000000000000000000000000000aa",
    "authorization": {
      "from":        "01deadbeefcafebabe0000000000000000000000000000000000000000000000aa",
      "to":          "00feedfacefeedface0000000000000000000000000000000000000000000000bb",
      "value":       "1000000000",
      "validAfter":  "1717000000",
      "validBefore": "1717003600",
      "nonce":       "11112222333344445555666677778888aaaabbbbccccddddeeeeffff00001111"
    }
  }
}
```

### §3B.2 — Fixture-based tests

`packages/x402-gateway/test/schemas.test.ts`

```ts
describe('SupportedResponseSchema', () => {
  it('parses official-looking supported-response.json',                () => {});
  it('rejects missing x402Version',                                    () => {});
  it('rejects scheme !== "exact"',                                     () => {});
  it('rejects extra.feePayer not matching CasperAccountAddressHex',    () => {});
  it('rejects extra missing { feePayer, decimals, name, version }',    () => {});
  it('rejects network not matching ^casper:',                          () => {});
  it('accepts extra.decimals as number 9',                             () => {});
});

describe('PaymentPayloadSchema', () => {
  it('parses verify-request.exact-casper.json paymentPayload',         () => {});
  it('rejects flat payload (no authorization nesting)',                () => {});
  it('rejects authorization missing nonce',                            () => {});
  it('rejects from = account-hash-... (prefixed key form)',            () => {});
  it('rejects value containing non-digit characters',                  () => {});
  it('rejects unknown top-level fields (strict)',                      () => {});
  it('rejects x402Version !== 2',                                      () => {});
});

describe('PaymentPayload — address/publicKey type discipline', () => {
  it('parses from/to as CasperAccountAddressHex (00+64)',              () => {});
  it('parses publicKey as CasperPublicKeyHex (01+64)',                 () => {});
  it('rejects payment-payload.invalid-account-address.json',           () => {});
  it('rejects from = publicKey value verbatim',                        () => {});
  it('rejects publicKey = account-address value verbatim',             () => {});
  it('CasperPublicKeyHex accepts "02" + 66 hex (Secp256k1)',           () => {});
  it('CasperPublicKeyHex rejects "00" + 64 hex',                       () => {});
  it('CasperAccountAddressHex rejects "01" + 64 hex',                  () => {});
  it('CasperAccountAddressHex rejects "02" + 66 hex',                  () => {});
});

describe('CasperSignatureHex', () => {
  it('parses signature of exactly 130 lowercase hex chars',            () => {});
  it('rejects signature of 128 hex chars',                             () => {});
  it('rejects signature of 132 hex chars',                             () => {});
  it('rejects uppercase hex in signature',                             () => {});
});

describe('DecimalsField wire compatibility', () => {
  it('parses extra.decimals = 9 from /supported',                      () => {});
  it('parses extra.decimals = "9" from /verify',                       () => {});
  it('decimalsToNumber(9) === 9 and decimalsToNumber("9") === 9',      () => {});
  it('rejects extra.decimals = "9.5", -1, "abc"',                      () => {});
});

describe('PaymentRequirementsSchema', () => {
  it('parses verify-request.exact-casper.json paymentRequirements',    () => {});
  it('rejects asset with hash- prefix',                                () => {});
  it('rejects asset length != 64',                                     () => {});
  it('rejects extra missing decimals',                                 () => {});
  it('rejects maxTimeoutSeconds <= 0',                                 () => {});
});

describe('VerifyRequestSchema', () => {
  it('parses verify-request.exact-casper.json',                        () => {});
  it('rejects requirements.network != payload.network',                () => {});
  it('rejects requirements.asset != x402 asset config kind',           () => {});
});

describe('Verify response — Wire vs Normalized', () => {
  it('Wire parses success without payer (omitted)',                    () => {});
  it('Wire parses success with payer present',                         () => {});
  it('normalizeVerifyResponse fills payer from authorization.from when wire omits it', () => {});
  it('normalizeVerifyResponse keeps wire payer when present',          () => {});
  it('Normalized success requires payer (would-be regression test)',   () => {});
  it('Wire and Normalized parse the failure case identically',         () => {});
});

describe('Settle response — Wire vs Normalized', () => {
  it('Wire parses settle-response-success.wire.json',                  () => {});
  it('Wire rejects success without network or payer',                  () => {});
  it('Wire rejects transaction = object (it must be bare hash string)',() => {});
  it('Normalized parses settle-response-success.normalized.json',      () => {});
  it('Normalized rejects success with transaction as bare string',     () => {});
  it('normalizeSettleResponse(wire) === normalized fixture (deep eq)', () => {});
  it('normalizeSettleResponse maps wire.network → transaction.chainId',() => {});
  it('Wire and Normalized parse settle-response-failure.json identically', () => {});
});

describe('Cross-field address discipline', () => {
  it('SettleResponse.payer parses as CasperAccountAddressHex',         () => {});
  it('SupportedKind.extra.feePayer parses as CasperAccountAddressHex', () => {});
});
```

`packages/x402-gateway/test/header.test.ts`

```ts
describe('PAYMENT-SIGNATURE header codec', () => {
  it('round-trips payload ↔ header value (base64url, no padding)',     () => {});
  it('extracts PaymentPayload from header verbatim of fixture',        () => {});
  it('safeDecode returns invalid_payload on malformed base64',         () => {});
  it('safeDecode returns invalid_payload on non-JSON body',            () => {});
  it('safeDecode returns invalid_payload on schema mismatch',          () => {});
  it('decode throws on schema mismatch',                               () => {});
});
```

`packages/payment-ledger/test/replay-ledger.test.ts`

```ts
describe('payment-ledger replay protection', () => {
  it('inserts (nonce, payer, asset, payload_hash) once successfully',          () => {});
  it('rejects duplicate (nonce, payer, asset) with replay_detected',           () => {});
  it('rejects duplicate payload_hash regardless of payer',                     () => {});
  it('allows same nonce for different payer+asset combinations',               () => {});
  it('payload_hash = sha256(canonical_json(payload.authorization))',           () => {});
  it('writes are atomic — failed transfer leaves no ledger row',               () => {});
  it('UNIQUE indexes survive WAL checkpoint',                                  () => {});
});
```

#### `payment_ledger` schema

```sql
CREATE TABLE payment_ledger (
  id            TEXT PRIMARY KEY,
  payer         TEXT NOT NULL,
  asset         TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  amount        TEXT NOT NULL,
  network       TEXT NOT NULL,
  state         TEXT NOT NULL,                  -- 'verified'|'settled'|'failed'
  settle_deploy_hash TEXT,
  trace_id      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (nonce, payer, asset),
  UNIQUE (payload_hash)
);
CREATE INDEX ix_payment_ledger_trace ON payment_ledger(trace_id);
```

### §3B.3 — Per-package interface signatures

#### `packages/shared`

```ts
// src/index.ts
export * from './casper-types';
export * from './intent-fsm';
export * from './canonical-json';
export * from './result';

// src/canonical-json.ts
export function canonicalJson(value: unknown): string;
export function canonicalSha256Hex(value: unknown): Hex64;

// src/intent-fsm.ts
export const ALLOWED_TRANSITIONS: ReadonlyMap<IntentState, ReadonlySet<IntentState>>;
export function canTransition(from: IntentState, to: IntentState): boolean;
export function assertTransition(from: IntentState, to: IntentState): void;
```

#### `packages/x402-gateway`

```ts
// src/index.ts
export * from './schemas';
export * from './header/payment-signature-header';
export * from './facilitator-client';
export * from './gateway';

// src/gateway.ts
export interface X402Gateway {
  supported(): Promise<SupportedResponse>;
  verify(req: VerifyRequest): Promise<NormalizedVerifyResponse>;
  settle(req: SettleRequest): Promise<NormalizedSettleResponse>;
  config(): X402GatewayConfig;
}
export function makeX402Gateway(deps: {
  facilitator: FacilitatorClient;
  ledger: PaymentLedger;
  clock: () => number;
  assets: Cep18X402AssetConfig[];
}): X402Gateway;

// src/facilitator-client.ts
export interface FacilitatorClient {
  supported(): Promise<unknown>;
  verify(body: VerifyRequest): Promise<unknown>;
  settle(body: SettleRequest): Promise<unknown>;
}
export function makeHttpFacilitatorClient(opts: {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}): FacilitatorClient;
```

#### `packages/payment-ledger`

```ts
export interface PaymentLedgerInsert {
  payer:        CasperAccountAddressHex;
  asset:        Cep18PackageHashHex;
  nonce:        Hex64;
  payloadHash:  Hex64;
  amount:       string;
  network:      CasperCaip2ChainId;
  traceId:      string;
}

export type LedgerInsertResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'replay_detected' };

export interface PaymentLedger {
  insertVerified(row: PaymentLedgerInsert): Promise<LedgerInsertResult>;
  markSettled(id: string, deployHash: Hex64): Promise<void>;
  markFailed(id: string, reason: X402ErrorReason): Promise<void>;
  findByPayloadHash(h: Hex64): Promise<PaymentLedgerRow | null>;
}
```

#### `packages/signer-guard`

```ts
export * from './types';
export * from './spend-ledger';

export interface SignerGuard {
  authorize(req: SignRequest): Promise<SignResult>;
}
export function makeSignerGuard(deps: {
  spendLedger: SpendLedger;
  signer: RawSigner;
  clock: () => number;
}): SignerGuard;

export interface SpendReservation {
  signerRole: SignerGuardPolicy['signerRole'];
  signerPk:   CasperPublicKeyHex;
  token:      Cep18PackageHashHex;
  dayUtc:     string;
  amount:     string;
  intentId:   string;
  traceId:    string;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'day_cap_exceeded' | 'reservation_conflict' };

export interface SpendLedger {
  reserve(res: SpendReservation, dayCap: string): Promise<ReserveResult>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
}
```

#### `packages/adapters`

```ts
export * from './capability';
export * from './casper-rpc';
export * from './cspr-cloud';
export * from './cspr-trade';
export * from './cep18';

export interface CasperRpcAdapter {
  getStatus(): Promise<{ chainspecName: string; blockHeight: number; apiVersion: string }>;
  getDeploy(hash: Hex64): Promise<DeployRecord | null>;
  putDeploy(signedDeploy: SignedDeploy): Promise<{ deployHash: Hex64 }>;
}

export interface CsprCloudAdapter {
  getStatus(): Promise<{ chainspecName: string }>;
  getAccount(address: CasperAccountAddressHex): Promise<AccountRecord | null>;
}
```

#### `packages/audit-trace`

```ts
export * from './types';
export interface AuditTraceStore {
  insert(trace: AuditTraceInternal): Promise<void>;
  get(traceId: string): Promise<AuditTraceInternal | null>;
  publicExport(traceId: string): Promise<AuditTracePublicExport | null>;
}

export interface PlannerRedactor {
  redact(rawPlannerOutput: unknown): AuditTraceInternal['plannerOutput'];
}
```

#### `packages/agent-core`

```ts
export interface AgentCore {
  plan(input: { goal: string; chainId: CasperCaip2ChainId; constraints: string[] }):
    Promise<{ goalDigest: Hex64; toolCalls: PlanToolCall[]; redactedSummary: string }>;
}
```

#### `apps/api`

```ts
export const intentsRouter: Hono;        // one route per FSM transition
export const x402Router: Hono;           // /supported, /verify, /settle
```

### §3B.4 — PolicyVault test names

```rust
// init.rs
#[test] fn init_sets_owner_to_caller();
#[test] fn init_sets_token_package_max_single_daily_limit();
#[test] fn init_emits_VaultConfigured_event_with_expected_fields();
#[test] fn init_reverts_InvalidValidUntil_when_valid_until_le_now_ms();

// admin.rs
#[test] fn non_owner_calling_allow_agent_reverts_NotOwner();
#[test] fn allow_then_revoke_agent_round_trip_emits_correct_events();
#[test] fn allow_then_revoke_receiver_round_trip_emits_correct_events();
#[test] fn set_limits_owner_only_emits_LimitsUpdated();
#[test] fn set_valid_until_can_shorten_below_current_value();
#[test] fn set_valid_until_can_extend_within_future();
#[test] fn set_valid_until_reverts_InvalidValidUntil_if_le_now_ms();
#[test] fn expire_now_sets_valid_until_to_now_ms_and_emits_Expired();
#[test] fn expire_now_blocks_subsequent_pay_with_VaultExpired();

// pay_happy_path.rs
#[test] fn pay_happy_path_transfers_cep18_and_emits_Paid();
#[test] fn pay_happy_path_increments_day_spend_and_paid_total();
#[test] fn pay_happy_path_marks_payload_hash_used();

// pay_policy_branches.rs
#[test] fn pay_reverts_AgentNotAllowed_when_caller_not_in_agents();
#[test] fn pay_reverts_ReceiverNotAllowed_when_receiver_not_allowed();
#[test] fn pay_reverts_VaultExpired_when_now_ms_ge_valid_until();
#[test] fn pay_reverts_AmountAboveMax_when_amount_gt_max_single();
#[test] fn pay_reverts_DayLimitExceeded_when_day_spend_plus_amount_gt_daily_limit();
#[test] fn pay_reverts_InsufficientVaultBalance_when_balance_lt_amount();

// pay_arithmetic_overflow.rs
#[test] fn pay_reverts_ArithmeticOverflow_on_day_spend_checked_add_overflow();
#[test] fn pay_reverts_ArithmeticOverflow_on_paid_total_checked_add_overflow();

// pay_replay_payload_hash.rs
#[test] fn pay_with_same_payload_hash_twice_reverts_NonceAlreadyUsed();
#[test] fn pay_with_different_payload_hashes_for_same_receiver_amount_succeeds_twice();
#[test] fn payload_hash_is_opaque_does_not_embed_day_index();

// pay_day_rollover.rs
#[test] fn day_rollover_resets_day_spend_to_zero();
#[test] fn pay_at_day_boundary_does_not_lose_concurrent_spend();

// valid_until.rs
#[test] fn pay_just_before_valid_until_ms_succeeds();
#[test] fn pay_exactly_at_valid_until_ms_reverts_VaultExpired();

// events_emitted.rs
#[test] fn all_state_changes_emit_one_and_only_one_event();
#[test] fn Paid_event_payload_hash_field_equals_input_payload_hash();

// errors_revert_codes.rs
#[test] fn all_PolicyVaultError_variants_revert_with_unique_user_codes();
```

### §3B.5 — CEP-18 cross-contract integration

```rust
// cep18_integration.rs
#[test] fn deploys_cep18_then_policy_vault_in_host_env();
#[test] fn vault_transfer_calls_cep18_transfer_with_correct_recipient_and_amount();
#[test] fn vault_calls_cep18_balance_of_self_before_transfer();
#[test] fn vault_pay_propagates_cep18_error_when_odra_generated_ref_transfer_fails();
#[test] fn vault_pay_does_not_change_accounting_when_cep18_transfer_fails();
#[test] fn integration_full_flow_init_allow_pay_balanceof_matches_expected();
#[test] fn integration_with_Cep18X402_token_having_transfer_with_authorization();
```

### §3B.6 — Intent FSM tests

```ts
describe('IntentState transitions', () => {
  // Allowed
  it('allows DRAFT → POLICY_VALIDATED',                               () => {});
  it('allows POLICY_VALIDATED → PAYMENT_REQUIRED',                    () => {});
  it('allows PAYMENT_REQUIRED → PAYMENT_VERIFIED',                    () => {});
  it('allows PAYMENT_VERIFIED → READY_TO_SUBMIT',                     () => {});
  it('allows READY_TO_SUBMIT → SIGNED_RECEIVED',                      () => {});
  it('allows SIGNED_RECEIVED → ACCEPTED_BY_NODE',                     () => {});
  it('allows SIGNED_RECEIVED → REJECTED',                             () => {});
  it('allows ACCEPTED_BY_NODE → EXECUTED',                            () => {});
  it('allows ACCEPTED_BY_NODE → EXECUTION_FAILED',                    () => {});
  it('allows ACCEPTED_BY_NODE → TIMEOUT',                             () => {});
  it('allows EXECUTED → FINALIZED',                                   () => {});
  it('allows SIGNED_RECEIVED → ACCEPTED_BY_NODE via attach-deploy-hash',() => {});
  it('allows TIMEOUT → ACCEPTED_BY_NODE via attach-deploy-hash',      () => {});
  it('allows any non-terminal → REJECTED (cancel)',                   () => {});
  // Forbidden
  it('forbids DRAFT → EXECUTED',                                      () => {});
  it('forbids POLICY_VALIDATED → READY_TO_SUBMIT',                    () => {});
  it('forbids PAYMENT_REQUIRED → SIGNED_RECEIVED',                    () => {});
  it('forbids EXECUTED → EXECUTION_FAILED',                           () => {});
  it('forbids EXECUTION_FAILED → FINALIZED',                          () => {});
  it('forbids TIMEOUT → FINALIZED',                                   () => {});
  it('forbids FINALIZED → anywhere (terminal)',                       () => {});
  it('forbids REJECTED → anywhere (terminal)',                        () => {});
  // Semantic invariants
  it('TIMEOUT is not classified as failure for analytics',            () => {});
  it('attach-deploy-hash requires intent.execution.deployHash set',   () => {});
});

describe('POST /intents/:id/* state-machine routes', () => {
  it('rejects /verify-payment when state != PAYMENT_REQUIRED with 409', () => {});
  it('rejects /submit when state != SIGNED_RECEIVED with 409',          () => {});
  it('rejects /attach-deploy-hash when state ∉ {SIGNED_RECEIVED, TIMEOUT}', () => {});
  it('rejects /cancel when state ∈ {FINALIZED, REJECTED}',              () => {});
  it('persists updatedAtMs on every successful transition',             () => {});
  it('GET /intents/:id includes paymentMode, executionMode, chainId',   () => {});
});
```

### §3B.7 — SignerGuard tests

```ts
describe('SpendLedger reservation model', () => {
  it('first reserve under cap succeeds and returns reservationId',                () => {});
  it('reserve returns day_cap_exceeded when sum(reserved+committed)+amount>cap',  () => {});
  it('release removes the row so further reserves can succeed',                   () => {});
  it('commit flips state to committed; row still counts toward cap',              () => {});
  it('two concurrent reserves cannot each individually pass the cap (serialized)',() => {});
  it('day_utc rollover starts a fresh cap window',                                () => {});
  it('reserved rows older than configurable TTL are auto-released by sweeper',    () => {});
  it('UNIQUE(intent_id) prevents double reserve for the same intent',             () => {});
});

describe('SignerGuard.authorize', () => {
  it('denies chain_not_allowed when intendedChainId ∉ policy.allowedChainIds',    () => {});
  it('denies package_not_allowed when intendedToken (as package) not allowed',    () => {});
  it('denies token_not_allowed when intendedToken not in allowedTokens',          () => {});
  it('denies receiver_not_allowed when allowlist + empty allowedReceivers',       () => {});
  it('denies receiver_not_allowed when receiverPolicy=deny_all',                  () => {});
  it('denies receiver_not_allowed when allow_any_with_manual_approval + no token',() => {});
  it('permits receiver when allowlist and receiver in allowedReceivers',          () => {});
  it('denies amount_above_single_cap when amount > maxSinglePayment',             () => {});
  it('denies trace_id_missing when requireTraceId and traceId is empty',          () => {});
  it('reserves spend before signing and releases on subsequent denial',           () => {});
  it('returns reservation_conflict if reserve() fails after policy passed',       () => {});
  it('on intent EXECUTED, commits the reservation',                               () => {});
  it('on intent REJECTED|TIMEOUT-after-window, releases the reservation',         () => {});
  it('never returns signed bytes when any check fails',                           () => {});
  it('never logs the signature on denial path',                                   () => {});
});

describe('policyDigest canonical JSON', () => {
  it('produces identical digest for key order permutations',                     () => {});
  it('produces identical digest for whitespace variants of input',               () => {});
  it('atomic amounts as strings are preserved bit-for-bit',                      () => {});
  it('array order is preserved (semantic ordering)',                             () => {});
  it('changing receiverPolicy changes the digest',                               () => {});
  it('flipping empty allowedReceivers from [] to ["..."] changes the digest',    () => {});
});
```

### §3B.8 — Adapter capability tests

```ts
describe('CapabilityBootReport', () => {
  it('bootSatisfied=true when ≥1 chain_status OK AND db OK',                     () => {});
  it('bootSatisfied=false when db not writable, even if casper_rpc OK',          () => {});
  it('bootSatisfied=false when all chain_status adapters fail, even if db OK',   () => {});
  it('passes when casper_rpc OK but cspr_cloud_rest down (loosened rule)',       () => {});
  it('asserts RPC chainspec_name matches chainId; mismatch → adapter not OK',    () => {});
  it('enables payment=x402_testnet when x402 facilitator reachable',             () => {});
  it('keeps payment modes available when dex adapter is missing',                () => {});
  it('omits dex-dependent endpoints from enabledRoutes when dex missing',        () => {});
  it('omits submission-dependent transitions when submission adapter missing',   () => {});
  it('keeps observation-dependent transitions when only submission missing',     () => {});
  it('reports per-adapter detail string for adapter-doctor output',              () => {});
  it('AdapterStatus.chainspecName populated for all chain_status adapters',      () => {});
});

describe('adapter-doctor CLI', () => {
  it('exits 0 when bootSatisfied=true',                                         () => {});
  it('exits 1 when bootSatisfied=false',                                        () => {});
  it('prints colored per-tier status table to stdout',                          () => {});
  it('--json flag emits CapabilityBootReport JSON',                             () => {});
});
```

### §3B.9 — AuditTrace tests

```ts
describe('PlannerRedactor.redact', () => {
  it('extracts goalDigest from raw planner output without storing raw text',     () => {});
  it('extracts chosenStrategyId when present',                                   () => {});
  it('maps tool_calls → toolCalls with arg/out digests only',                    () => {});
  it('produces decisionsRedactedSummary ≤ 400 chars',                            () => {});
  it('never includes raw prompt text in output',                                 () => {});
  it('never includes raw model response text in output',                         () => {});
  it('never includes chain-of-thought / scratchpad in output',                   () => {});
  it('never includes private keys, env vars, or facilitator API key in output', () => {});
  it('throws if input has unknown structure (fail-closed)',                      () => {});
});

describe('AuditTraceStore', () => {
  it('insert stores full on-chain refs (payer, receiver, deploy hashes)',        () => {});
  it('get returns the full internal shape including payer and receiver',         () => {});
  it('publicExport OMITS payerAccount',                                          () => {});
  it('publicExport OMITS receiverAccount',                                       () => {});
  it('publicExport KEEPS deployHashes, vaultPackageHash, chainId',               () => {});
  it('publicExport collapses toolCalls to toolCallsCount',                       () => {});
  it('publicExport keeps policyChecks rule+passed (no reason text)',             () => {});
  it('publicExport keeps chosenStrategyId, constraintsApplied, summary',         () => {});
});

describe('AuditTrace secret-leak guard (property tests)', () => {
  it('rejects insert if any unknown top-level key present (strict schema)',      () => {});
  it('rejects insert if plannerOutput.decisionsRedactedSummary > 400 chars',     () => {});
  it('rejects insert if any string matches typical secret patterns (sk-, etc.)',() => {});
});
```

### §3B.10 — Demo Tier 1 acceptance tests

```ts
describe('Demo Tier 1 — PolicyVault real on-chain proof (REQUIRED)', () => {
  it('deploys PolicyVault to casper:casper-test and records package hash',                 () => {});
  it('publishes deploy hash + package hash to docs/demo/tier1-artifacts.json',             () => {});
  it('CapabilityBootReport reports chainId casper:casper-test and chainspec match',        () => {});

  it('agent-allowed signer calls pay() — deploy accepted',                                 () => {});
  it('deploy observed EXECUTED in a block; deployHash recorded in audit trace',            () => {});
  it('CEP-18 balance of receiver increased by amount on-chain',                            () => {});
  it('publishes payment deploy hash + explorer URL to tier1-artifacts.json',               () => {});

  describe('Rejected policy call — pathway A: API rejects pre-sign', () => {
    it('intent for non-allowed receiver gets POLICY_VALIDATED=false in audit trace',       () => {});
    it('SignerGuard.authorize returns ok=false with reason=receiver_not_allowed',          () => {});
    it('no deploy is signed, no on-chain artifact required',                               () => {});
  });

  describe('Rejected policy call — pathway B: on-chain revert', () => {
    it('agent-allowed signer crafts pay() to non-allowed receiver',                        () => {});
    it('deploy observed EXECUTION_FAILED with PolicyVaultError::ReceiverNotAllowed code',  () => {});
    it('publishes rejected deploy hash + error code to tier1-artifacts.json',              () => {});
  });

  it('tier1-artifacts.json validates against TierOneArtifactsSchema',                      () => {});
});
```

#### `TierOneArtifactsSchema`

```ts
export const TierOneArtifactsSchema = z.object({
  chainId: CasperCaip2ChainId,
  vault: z.object({
    packageHash: Cep18PackageHashHex,
    deployHash:  Hex64,
    explorerUrl: z.string().url(),
  }),
  paymentSuccess: z.object({
    deployHash:  Hex64,
    explorerUrl: z.string().url(),
    receiver:    CasperAccountAddressHex,
    amount:      AtomicDecimalString,
  }),
  rejection: z.discriminatedUnion('pathway', [
    z.object({ pathway: z.literal('api_pre_sign'),
               traceId: z.string(),
               failedRule: z.string() }),
    z.object({ pathway: z.literal('on_chain_revert'),
               deployHash: Hex64,
               explorerUrl: z.string().url(),
               errorCode: z.string() }),
  ]),
});
```

### §3B.11 — Fixture & directory conventions

```
caspilot/
├── packages/x402-gateway/__fixtures__/        # frozen JSON
├── packages/payment-ledger/__fixtures__/
├── packages/signer-guard/__fixtures__/
├── packages/audit-trace/__fixtures__/
├── docs/demo/tier1-artifacts.json             # generated, schema-validated in CI
└── scripts/
    ├── adapter-doctor.ts
    ├── deploy-vault.ts
    ├── seed-demo.ts
    ├── dry-run.ts
    └── demo-tier1.test.ts
```

- Fixtures are **immutable** once committed; new variants get new filenames.
- All schema files end in `.schema.ts` and export both the Zod schema and the inferred type.
- All test files end in `.test.ts` / `.rs`.
- Rust tests run under Odra `HostEnv`; CI step `cargo test -p policy-vault`.
- TS tests run under `vitest`; CI step `pnpm -r test`.
- Demo Tier 1 harness runs against a configured testnet endpoint (env-gated).

### §3B.12 — What §3B intentionally excludes

- Function bodies / implementation logic — that's the next plan.
- UI component interfaces — separate frontend pass.
- Strategy planning prompt content — audit-trace forbids storing it.
- Rate limiting, auth, CORS — operational concerns deferred to §3C if needed.

---

## Open follow-ups (not blocking)

- `CasperSignatureHex` regex is `^[0-9a-f]{130}$` — tighten to algo-prefixed form once the Go facilitator fixture is pinned. Schema change must ship with a fixture diff in the same commit.
- `WireSettleResponseSchema` is the current best read of the reference; if real facilitator behavior diverges (e.g. transaction returned as an object), update wire schema + add a wire-shape regression fixture, leave Normalized untouched.

---

## Status

Design approved through §3B. Next step: implementation plan via `writing-plans`. Bodies, persistence wiring, and runtime topology details live in the plan, not here.
