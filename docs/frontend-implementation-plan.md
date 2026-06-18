# Caspilot Frontend 落地实施计划

**From:** the open-design static artifacts in `caspilot/uiux-design/` (9 HTML + 7 notes + logo)
**To:** the real `apps/web` Next.js 14 App Router / React 18 application
**Date:** 2026-06-16 · **Target:** Casper Agentic Buildathon Tier-1 demo (due 2026-06-30)

> Sibling doc: `frontend-open-design-plan.md` was the *generation* plan (how to drive open-design to produce the artifacts). **This** doc is the *porting* plan (artifacts → shipping app). It does not change any code yet — it is the plan to be approved first.

---

## 0. TL;DR

The artifacts are a complete, internally-consistent design system (one shared "shell" + 8 pages), already polished by per-page "refine next" notes that ship production-ready CSS/JS. The real `apps/web` is a **secure but skeletal** Tailwind app: 4 bare routes, 4 basic components, a guarded API client and wallet wrapper. The port is mostly **net-new UI built on top of solid security scaffolding**, plus a **small, honest set of backend reads**.

**Three decisions to confirm before building (details in §4):**

| # | Decision | Recommendation |
|---|----------|----------------|
| **D1** | Styling: adopt the artifact's CSS-variable design system as global CSS (+ `next/font`), or re-express it in Tailwind? | **Adopt the design system as global CSS.** The CSS is already written and tuned; Tailwind-rewriting is lossy and slow. Keep Tailwind's reset only (or drop it). |
| **D2** | Vaults: full multi-vault CRUD, or render the **real** governing policy as a read-only vault for the demo? | **Read-only from the live `SignerGuardPolicy` + `SpendLedger`.** Honest provenance; create/revoke are stretch. |
| **D3** | Intent-detail data: add `GET /intents/:id`, or derive from the existing trace? | **Derive from the trace** (zero backend) + add only a small **`GET /intents` list** (the one genuinely missing read). |

**Phasing (each milestone is shippable):** M1 design-system foundation + AppShell → M2 intent lifecycle (detail → list → console) → M3 public pages (landing, developers) → M4 vaults (+ backend reads) → M5 brand mark, polish, a11y/reduced-motion, visual audit.

---

## 1. Source inventory (what open-design produced)

**9 page artifacts** (`caspilot/uiux-design/*.html`): `caspilot-shell` (the shared chrome + token system — the foundation), `caspilot-landing`, `caspilot-console`, `caspilot-intents`, `caspilot-intent-detail`, `caspilot-vaults`, `caspilot-vault-detail`, `caspilot-developers`, `caspilot-logo-display`.

**7 notes** (authoritative — they post-date and override the raw artifact bodies):
- `caspilot-landing/console/vaults/vault-detail/developers/logo-display 页面的修改意见.md` — per-page "refine next" with drop-in CSS/HTML/JS.
- `Caspilot Logo 集成方案.md` — where the mark is placed across pages + favicon wiring.
- **No notes for `intents` / `intent-detail`** — those two artifacts are their own source of truth.

**Rule for the implementer:** when a page has a note, build from the **note's** CSS/JS (it fixes typos, responsive bugs, and tightens the design-system invariants); fall back to the artifact body only for sections the note doesn't touch.

### Design system invariants (hold across every page)
- **Tokens** (`:root`): `--canvas #0A0A0B`, `--surface #141417`, `--surface-2 #1C1C21`, `--hairline #2A2A31`, `--text #ECECEE`, `--text-muted #9A9AA3`, `--accent #FF5A1F`, `--accent-dim #7A2E12`, `--validated #3B82F6`, `--payment #D97706`, `--inflight #6366F1`, `--executed #16A34A`, `--failed #DC2626`. Layout: `--sidebar-w 240px`, `--topbar-h 56px`, `--ease cubic-bezier(0.16,1,0.3,1)`.
- **Fonts:** Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (**all** hashes / amounts / timestamps / ids).
- **Amber is sacred:** `--accent` marks the **one** current in-progress *authorize* action per viewport — the `.step.current` FSM node **or** the single primary CTA, never both. Completed = `--executed` green; needs-attention = `--payment`; destructive/server-error = `--failed`.
- **State colors are confined** to badges / meters / cap-bars / node strokes — never washed across cards or table cells.
- **One glyph + one amber focus per viewport.** `prefers-reduced-motion` kills all animation.

---

## 2. Current `apps/web` baseline (verified 2026-06-16)

```
apps/web/
  app/
    layout.tsx            bg-zinc-950 text-zinc-100 (Tailwind), <title>Caspilot</title>
    globals.css           ONLY: @tailwind base; @tailwind components; @tailwind utilities;
    page.tsx              "/"            bare <h1>Caspilot</h1> + blurb
    intents/page.tsx      "/intents"     <IntentForm> + latest <StateBadge>
    intents/[id]/page.tsx "/intents/:id" polls getTrace every 2s → <TraceList>   ← real polling already here
    vaults/page.tsx       "/vaults"      <VaultForm> + JSON echo
  src/
    components/  IntentForm, StateBadge, TraceList, VaultForm
    lib/         api.ts (CaspilotApi), env.ts, wallet.ts
  scripts/check-bundle-secrets.mjs   (build:check gate)
```

- **Stack:** `next@14.2.5`, `react@18.3.1`, `zod@3.23.8`. Tests: `vitest` + `@testing-library/react` (`test`), `build:check` (next build + bundle secret scan), `biome` lint. Dev on **:3001**; API base `NEXT_PUBLIC_CASPILOT_API_BASE` (default `http://localhost:8787`); network `NEXT_PUBLIC_CASPER_NETWORK` (default `casper:casper-test`).
- **Styling = Tailwind utilities only.** No tokens, no custom fonts, no design-system CSS. (This is the D1 fork.)
- **Reusable security assets to KEEP verbatim:**
  - `lib/env.ts` — `FORBIDDEN_PUBLIC_KEYS` + `validatePublicEnv()` (rejects any `NEXT_PUBLIC_*` secret).
  - `lib/wallet.ts` — `ClickWallet` rejects providers exposing `CSPR_CLOUD_KEY`/`PRIVATE_KEY`; exposes `connect()` + `signDeploy({deployHashHex}) → {signatureHex}`. **This is the SignFlow backbone — currently unwired.**
  - `components/TraceList.tsx` — client-side `sanitize()` strips `privateKey`/`reasoning`/`chainOfThought`/`prompt`/… (defense-in-depth on top of server redaction). Keep the sanitize; restyle the render.
  - `scripts/check-bundle-secrets.mjs` — must stay green after the port.
- **Components to restyle/absorb (logic mostly reusable):**
  - `StateBadge` — already maps all 12 FSM states to tones; **re-map** to the 6 semantic badge classes (`.badge.draft|validated|payment|inflight|executed|failed` + `.bdot`).
  - `TraceList` — sorts **ascending**; design wants **newest-first** + `kind` chip + `redacted` chip + mono payload.
  - `IntentForm` / `VaultForm` — basic controlled forms; fold into the New-intent **drawer** and the SignFlow **draft step** respectively.

---

## 3. Backend contract: reality vs. what the designs assume

**Exists today** (`apps/api`, Hono, in-memory intent `Map` + persisted audit/spend stores):

| Method | Path | Returns |
|---|---|---|
| POST | `/intents` | `201 {id, state:"DRAFT"}` |
| POST | `/intents/:id/validate-policy` | `200 {id,state:"POLICY_VALIDATED",policyDigest}` · `422 {state:"REJECTED",code}` · `404` · `409` |
| POST | `/intents/:id/mark-executed` | `200 {id,state:"EXECUTED",deployHash}` · `400` · `404` · `409` (demo fast-forward; collapses x402/sign sub-protocol) |
| GET | `/intents/:id/trace` | `200 {id, entries:[{atMs,state,kind,payload}]}` · `404` |
| POST | `/intents/:id/reject` | `200 {id,state:"REJECTED",reason}` · `404` · `409` |
| GET | `/healthz`, `/version` | health |

**The trace is a complete event log** — every datum the detail page needs is already in it:
`kind:"created"` → `payload.body` (agent/receiver/token/contract/network/amount) · `kind:"policy_check"` → `payload.policyDigest` or `payload.code` · `kind:"execution"` → `payload.deployHash` · latest entry's `state` → current state.

**Gaps the designs assume (and the verdict):**

| Design needs | Status | Plan |
|---|---|---|
| Intent **list** (`/intents`, `/console`) | ✗ no endpoint | **Add `GET /intents`** → `[{id,state,...body,updatedAtMs}]` from the Map. ~15 lines. (D3) |
| Single intent header/KV/proof (`/intents/:id`) | ✗ no `GET /intents/:id` | **Derive from `getTrace`** client-side (zero backend). Optionally add `GET /intents/:id` later for cleanliness. (D3) |
| `markExecuted` in client | ✗ not wrapped | Add `CaspilotApi.markExecuted(id, deployHash)`. |
| 422 policy denial rendered as REJECTED + reason | partial | `validatePolicy` currently **throws** on non-2xx → change to return structured `{state,code}` for 422 so the UI renders the rejection (not a toast). |
| Vault **list / detail** (`/vaults`, `/vaults/:id`) | ✗ no endpoints | **Add read endpoints over the live `SignerGuardPolicy` + `SpendLedger`** (D2): identity/limits/lifecycle/usedToday/recent debits. |
| Vault **create / revoke** | ✗ none | **Stretch.** Create = draft+sign+submit `create_vault` deploy via the write-adapter; revoke returns `409` when in-flight. Demo can ship read-only. |
| x402 **pay & verify** (detail page) | collapsed into `mark-executed` | Keep simulated-by-design for Tier-1 (consistent with the documented fast-forward); the "Pay & verify" CTA drives `mark-executed` with a real broadcast hash. |

> All on-chain proof is **casper-test only**; real broadcast stays gated by `RUN_REAL_ONCHAIN=1` per project rules. The UI links proofs to `testnet.cspr.live`.

---

## 4. Pivotal decisions (with rationale)

### D1 — Styling: adopt the artifact design system as global CSS  ✅ recommended
The artifacts are **not** mock-ups to re-interpret; they are hand-tuned CSS (tokens, semantic classes, keyframes, real `:disabled`/`.is-loading`/`prefers-reduced-motion` states). Porting path:
1. Move the shell's `:root` token block + base/element styles into `app/globals.css` (keep `@tailwind base` for the reset only, or drop Tailwind entirely — the app uses almost no utilities).
2. Load the 3 families via `next/font/google` (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono), expose as `--display/--body/--mono`.
3. Author each component's CSS as a **CSS Module** (`Foo.module.css`) using the artifact's class names, or one global `design-system.css` of semantic classes. Recommendation: **global `design-system.css` for shared primitives** (`.btn`, `.panel`, `.badge`, `.meter`, `.stepper`…) + **CSS Modules for page-local** blocks. This mirrors the artifacts 1:1 and keeps diffs reviewable against the notes.
- *Alternative (not recommended):* encode tokens in `tailwind.config` and rebuild every component in utilities — high effort, drifts from the tuned source, loses the keyframes/states.

### D2 — Vaults: read the real policy as one vault  ✅ recommended for Tier-1
The backend governs the agent with a **single** `SignerGuardPolicy` (caps/allowlist/receiver/signerRole) + a `SpendLedger`. The design shows multiple vaults with create/revoke — aspirational. For an **honest** demo (a stated project value), render the **actual** governing policy as "the vault": real caps, real `usedToday` from the ledger, real recent debits from committed reservations. Multi-vault CRUD + the CSPR.click create flow are **stretch** (M4+). This keeps "no fake data in the judge-facing demo."

### D3 — Intent-detail derives from trace; add only the list  ✅ recommended
The detail page (the product's heart) needs current state + proposed-intent KV + policyDigest + deployHash — **all present in the trace**, which the page already polls every 2s. So: build a `deriveIntent(entries)` selector; **no `GET /intents/:id` needed** for the demo. The **only** unavoidable backend read is `GET /intents` for the list/console. (Add `GET /intents/:id` later if SSR/first-paint without a poll round-trip becomes desirable.)

---

## 5. Target architecture

### 5.1 Route map (App Router route groups)
Two chrome contexts: **(marketing)** pages have their own/zero chrome; **(app)** pages share the sidebar+topbar shell.

```
app/
  layout.tsx                    fonts + globals + <body> (no chrome)
  (marketing)/
    layout.tsx                  minimal wrapper
    page.tsx                    /            Landing (own footer; no sidebar)
    developers/page.tsx         /developers  Docs (own slim topbar + anchor-nav)
  (app)/
    layout.tsx                  <AppShell> (Sidebar + Topbar)  ← active-nav aware
    console/page.tsx            /console
    intents/page.tsx            /intents
    intents/[id]/page.tsx       /intents/:id   (keep the existing 2s poll, wrapped)
    vaults/page.tsx             /vaults
    vaults/[id]/page.tsx        /vaults/:id
  icon.svg / favicon            CaspilotMark favicon (refined 16px geometry)
```
URLs are unchanged for existing routes; files relocate into groups. **Landing currently lives at `app/page.tsx`** → moves to `app/(marketing)/page.tsx`.

### 5.2 Shared primitives (build once, in M1)
Mapped straight from the shell + notes:

| Component | Source class(es) | Notes |
|---|---|---|
| `<AppShell>` | `.app` grid, `.sidebar`, `.topbar`, off-canvas `@860px` + `.menu-toggle` | route-group layout; reads active nav from pathname |
| `<Sidebar>` / `<NavItem active>` | `.brand`/`.wordmark`/`.tagline`, `.nav`/`.nav-item` (amber `::before` bar), `.sidebar-footer` (`.env-label`/`.net-dot`/`.build-chip`) | brand mark-dot → `<CaspilotMark>` 22–24px |
| `<Button variant primary loading>` | `.btn`/`.btn-primary`/`.is-loading`/`.spinner`/`.plus` | owns `:disabled` + spinner |
| `<Panel label>` | `.panel`/`.panel-label`/`.panel-corner` | |
| `<StateBadge state>` | `.badge.{draft\|validated\|payment\|inflight\|executed\|failed}` + `.bdot` | 12 FSM states → 6 classes (see §6) |
| `<Meter pct>` + `<RollingNumber>` | `.meter`/`.meter-fill` warn≥80 crit≥90, `[data-roll]` count-up | shared by console cards + vault detail; extract one hook |
| `<HealthDot>` / `<NetworkPill>` | `.health-dot` (healthy/degraded/down + pulse), `.network-pill`/`.pill-dot` | HealthDot ← `GET /healthz` |
| `<WalletButton>` | `.wallet-btn` `.idle`/`.connected` + `.key-dot`/`.caret` | wraps `ClickWallet` |
| `<CaspilotMark variant>` | refined SVG (§7.8) | `currentColor` ring + `--accent` needle |
| `<Tooltip>` | `.tooltip-wrap`/`.tip` | |

### 5.3 Data layer
- Extend `CaspilotApi` (`src/lib/api.ts`): `listIntents()`, `markExecuted(id, deployHash)`, `getVaults()`, `getVault(id)`; make `validatePolicy` return structured `{state, code?}` (don't throw on 422).
- Add a tiny `useIntentTrace(id)` hook wrapping the existing poll (2s; **stop at terminal** FINALIZED/EXECUTED/REJECTED/EXECUTION_FAILED/TIMEOUT) + `deriveIntent(entries)` selector.
- Keep everything **client components** talking to the API base (no secrets server-side in web). All amounts/hashes/ids render in `--mono`.

---

## 6. FSM state → badge/stepper mapping (single source of truth)

`<StateBadge>` and `<FsmStepper>` must agree:

| FSM state | Badge class | Stepper |
|---|---|---|
| DRAFT | `.draft` (muted) | rail node 1 |
| POLICY_VALIDATED | `.validated` (blue) | rail node 2 |
| PAYMENT_REQUIRED | `.payment` (amber-brown) | rail node 3 |
| PAYMENT_VERIFIED | `.inflight` (indigo) | rail node 4 |
| READY_TO_SUBMIT | `.inflight` | rail node 5 |
| SIGNED_RECEIVED | `.inflight` | rail node 6 |
| ACCEPTED_BY_NODE | `.inflight` | rail node 7 |
| EXECUTED | `.executed` (green) | rail node 8 |
| FINALIZED | `.executed` | rail node 9 |
| REJECTED | `.failed` (red) | **off-ramp** badge |
| EXECUTION_FAILED | `.failed` | **off-ramp** badge |
| TIMEOUT | `.failed` | **off-ramp** badge |

**Stepper** = 9 happy-path rail nodes + 3 terminal-bad off-ramp badges (dashed-top), never on the rail. Node states: `done` (green + ✓), `current` (**amber** + `stepPulse` ring — the single amber focus), future (grey hollow). `current` = the intent's present state.

---

## 7. Per-page port specs

### 7.1 Foundation + AppShell  *(M1 — do first)*
Tokens + fonts into `globals.css`; build §5.2 primitives with TDD; `(app)/layout.tsx` = `<AppShell>` with pathname-driven active nav; favicon via `<CaspilotMark>`. **Exit:** every existing route renders inside the shell with correct fonts/tokens; `build:check` green.

### 7.2 Intent detail `/intents/:id`  *(M2 — the core)*
Build from the **artifact** (no note exists). Components: `<Breadcrumb>` (+copy-id), header large `<StateBadge lg>`, **`<FsmStepper steps current>` + `<OffRampBadges>`**, `<ProposedIntentPanel>` (`.kv`), `<ActionsPanel state>` (gated) + `<RejectConfirm>`, `<X402PaymentPanel>`, `<OnChainProofPanel>` (hash + copy + `testnet.cspr.live` link + verified/pending), `<AuditTracePanel>` (owns the 2s poll; **newest-first**; `kind` + `redacted` chips; mono payload).
- **Data:** `useIntentTrace(id)` → `deriveIntent()` (state, body, policyDigest, deployHash). Reuse existing poll in `app/intents/[id]/page.tsx`.
- **Actions → endpoints:** "Validate policy" → `validate-policy` (render 422 REJECTED+code inline, not a throw); "Mark executed (demo)" → `markExecuted`; "Reject" → `reject` (typed reason); "Pay & verify" → drives `markExecuted` (x402 collapsed). Gating is by current FSM state (DRAFT shows Validate; POLICY_VALIDATED shows Mark/Reject; terminal shows none).
- **States:** not-found (404 from trace), trace 503 inline-alert, proof pending. **Amber focus = the single `.step.current`** (action buttons use neutral/danger, except the one primary when no step is "current").

### 7.3 Intents list `/intents`  *(M2)*
Build from the **artifact**. `<IntentsTable>`/`<IntentRow>` (full-row click + Enter/Space keyboard nav → `/intents/:id`), `<SegmentedFilter>` (All/Draft/Validated/Executed/Rejected + counts → query param), `<SearchBox>` (id/agent), `<NewIntentDrawer>` (absorbs `IntentForm`; regex validation `HEX=/^00[0-9a-fA-F]{64}$/`, `DEC=/^[0-9]+(\.[0-9]+)?$/`; network locked `casper:casper-test`; 422 → `.inline-alert`), `<Toast>`, `<EmptyState>`, skeleton.
- **Data:** `listIntents()` (**new** `GET /intents`); create → `createIntent` → optimistic prepend + toast + navigate.

### 7.4 Console `/console`  *(M2)*
Apply the **console note**. `<StatusStrip>` (4 stats, `roll()` count-up, cap-bar warn/crit + ticks), `<RecentIntents>` (reuse `<IntentsTable>` subset), `<VaultCards>` (mini-meter), `<FootStrip>` guarantees.
- **Data:** aggregate `listIntents()` (active/awaiting counts, executed-today); vault cards from `getVaults()` (M4 — until then, render from the single policy or hide). New nav entry "Dashboard" active.

### 7.5 Landing `/`  *(M3)*
Apply the **landing note**. No shell. Sections: `<Hero>` (dual grid + double-layer glow + telemetry chip; reveal stagger), `<TheModel>` (3 cards 01 PROPOSE / 02 AUTHORIZE / 03 EXECUTE — card 03 top-marker amber), `<ProductLines>` (x402 API · PolicyVault), `<SecurityModel>` (`.gnum` uses `--accent-dim`, full deploy hash → explorer), `<ProofStrip>`, `<FooterCTA>` + footer (mark 16–18px). All static/marketing (optionally bind `<HealthDot>` to real `/healthz`). `IntersectionObserver` reveals gated by reduced-motion.

### 7.6 Developers `/developers`  *(M3)*
Apply the **developers note**. Own slim `.topbar` (mark monochrome 20px; **amber → "Launch console" CTA**) + sticky `<AnchorNav>` scroll-spy. Sections: Overview (`.url-chip`), Auth, **x402 flow** (connector-node model: 01 REQUEST / 02 402 QUOTE / 03 PAY·RECEIPT / 04 200 OK + "same endpoint" retry-hint), endpoint blocks (`.ep-pair`/`.req-line`, full-length pasteable example values, `copyCode` copies pre-only), **error table** (neutral `.estatus` badges, dot-only semantic color, Recover column, 402/422/404/503). **Add the missing TOC link for `#reject`** (note flagged its absence).

### 7.7 Vaults `/vaults` + `/vaults/:id`  *(M4)*
Apply the **vaults** and **vault-detail** notes.
- **List:** `<VaultCard>` (state badge, identity KV, inline meter warn/crit, chips) + `<EmptyVaults>` + **`<SignFlowModal>`** (4 steps DRAFT→REVIEW→CONNECT→SIGN). The modal wires the **real** `ClickWallet`: REVIEW renders the `create_vault` deploy JSON from live form values; CONNECT shows the guard-note ("private key & `CSPR_CLOUD_KEY` never leave the wallet; only a **detached signature** crosses the wire"); SIGN returns `signatureHex` → submit. Wallet calls = connect+signDeploy; backend = submit (create — **stretch**).
- **Detail:** `<ScopedPolicyLedger>` (grouped identity/limits/lifecycle, copyable hashes), `<SpendMeter>` (live countdown `tickReset()`, segmented ledger track, single-cap marker), `<RecentDebits>`, `<RevokeDialog>` (typed-confirm against the **object-bound** `REVOKE_TARGET='revoke vault_…'` per the note — not bare "REVOKE"; consequences; success flips badge to REVOKED; **409** = "vault has in-flight intents — settle or cancel them first"), loading skeleton, not-found.
- **Data (D2):** `getVaults()` / `getVault(id)` over the live policy+ledger. Revoke/create = stretch endpoints.

### 7.8 Brand mark + favicon  *(M5, usable from M1)*
**Shipped geometry = `uiux-design/caspilot-logo-display.html`** (the approved render and source of truth; pinned by `test/caspilot-mark.test.tsx`). The component API is `<CaspilotMark size mono>` — a `mono` boolean (accent → `currentColor`), **not** a `variant` enum. 48-viewBox: ring `M34.4 13.2 A16 16 0 1 0 34.4 34.8` (`currentColor`, width 3, `vector-effect="non-scaling-stroke"`), east-pointing compass needle polygon `24,24 40.5,21.7 44,24 40.5,26.3` (`var(--accent)`), pivot `r=2.1` currentColor, tip-tick rect `x43.2 y22.4 w2 h3.2` (`var(--accent)`). `role="img"` + `aria-label="Caspilot"`. **favicon = `app/icon.svg`** (Next metadata convention — no manual `<link>` needed), 32-viewBox: rounded-rect `#0A0A0B` bg, ring `M23 9 A11 11 0 1 0 23 23` stroke 3.5 `#ECECEE`, needle `16,16 27,16 24,13.6 24,18.4` `#FF5A1F`, pivot `r=2` `#ECECEE`. Wordmark = Bricolage 600, `-0.01em` (composed as glyph + text in the sidebar, so no `lockup` variant is needed). Shipped placements: sidebar (22px), landing footer (18px), developers (18px ×2) — all default accent. Hero stays glyph-free. Do **not** add the mark to wallet/health/state badges/table rows, and do **not** add speculative `lockup`/`onlight`/`variant` API (YAGNI — no placement uses them).

> The earlier "refined lance" geometry (`ring M39.7 27.3…`, 5-point angled needle, separate `favicon.svg`) was a written spec that was never reconciled to the rendered mockup; the values above are what actually ships and what the mockup shows. Changing the glyph to the lance coordinates would be an **unverifiable visual change on this WSL2 box** — don't.

---

## 8. Backend additions (minimal, honest)

1. **`GET /intents`** → `[{id, state, agent, receiver, token, contract, network, amount, updatedAtMs}]` (enumerate the Map; sort desc). *Necessary.*
2. **API client:** `listIntents()`, `markExecuted(id,deployHash)`, structured `validatePolicy` (return `{state,code}` on 422), `getVaults()`, `getVault(id)`.
3. **`GET /vaults`, `GET /vaults/:id`** (D2) — project the live `SignerGuardPolicy` + `SpendLedger`: identity (admin/contract/token/receiver), limits (maxSingle/dailyCap), lifecycle (validUntil/signerRole), `usedToday`, recent debits (committed reservations). *Read-only.*
4. **Stretch:** `POST /vaults` (signed `create_vault` via write-adapter), `POST /vaults/:id/revoke` (409 on in-flight), an explicit x402 pay/verify route. *Not required for Tier-1.*

Each gets TDD coverage in `apps/api` mirroring the existing router tests.

---

## 9. Security & invariants (carry-over — non-negotiable)

- **No secrets to the browser:** keep `env.ts` `FORBIDDEN_PUBLIC_KEYS` + `validatePublicEnv`; keep `scripts/check-bundle-secrets.mjs` green (`pnpm build:check`).
- **Wallet:** only `ClickWallet` touches the provider; it rejects providers exposing `CSPR_CLOUD_KEY`/`PRIVATE_KEY`. **Only a detached signature crosses the wire** — the backend signs nothing, stores no key material. The SignFlow guard-note states this to the user.
- **Redaction is double:** server `PlannerRedactor` + client `TraceList.sanitize()`. Keep both. Trace shows audit transitions, **never** chain-of-thought/prompts.
- **Amber discipline:** exactly one amber focus per viewport (lint in review). State colors only in badges/meters/nodes.
- **Chain:** casper-test only; proofs link `testnet.cspr.live`; real broadcast gated by `RUN_REAL_ONCHAIN=1`.

---

## 10. Testing strategy (TDD per component)

`vitest` + `@testing-library/react`, red→green→refactor per the project's TDD rule. Minimum coverage:
- `StateBadge` — all 12 states → correct class/dot (incl. inflight group, off-ramp reds).
- `FsmStepper` — done/current/future partitioning; exactly one `current`; 3 off-ramp badges off-rail.
- `AuditTracePanel` — newest-first order; redaction passthrough; polling **stops at terminal**.
- `Meter`/`RollingNumber` — warn≥80 / crit≥90 thresholds; reduced-motion path.
- `NewIntentDrawer` — HEX/DEC regex validation; 422 inline-alert; locked network.
- `RevokeDialog` — confirm button enabled only on exact `REVOKE_TARGET` match; 409 surfaced.
- `WalletButton`/SignFlow — `ClickWallet` rejects forbidden provider fields; sign returns detached sig only.
- `env`/bundle — forbidden `NEXT_PUBLIC_*` rejected; `build:check` finds no secrets.
- **Visual audit (M5):** judge-facing screenshots per page (Playwright), not just green harnesses — per prior demo-quality lesson.

---

## 11. Sequencing / milestones

Component-locking order (consistent with `frontend-open-design-plan.md` §7 — **Shell first, Developers last**):

| Milestone | Scope | Ships |
|---|---|---|
| **M1 Foundation** | tokens+fonts in globals, §5.2 primitives (TDD), AppShell + route groups, CaspilotMark/favicon | shelled app, correct typography |
| **M2 Intent lifecycle** | detail (7.2) → list (7.3) → console (7.4); `GET /intents`, client `markExecuted`/structured `validatePolicy` | the core product loop, end-to-end on casper-test |
| **M3 Public** | landing (7.5), developers (7.6) | marketing + API docs |
| **M4 Vaults** | vaults list+SignFlow+detail (7.7); `GET /vaults[/:id]` read endpoints | delegated-vault story (read-only, real policy) |
| **M5 Polish** | logo placements, reduced-motion/a11y pass, visual screenshot audit, empty/error/loading parity | demo-ready |

**Stretch (post-Tier-1):** vault create/revoke mutations, explicit x402 pay route, `GET /intents/:id` for SSR.

---

## 12. Risks & open questions

- **D1/D2/D3 need a nod** before M1 — they shape the whole build.
- **In-memory intents:** the Map resets on API restart; `GET /intents` reflects that. Fine for demo; note in the script/runbook.
- **Vaults vs. single policy:** if judges expect visible multi-vault CRUD, M4 read-only may underwhelm — decide whether create/revoke is in or out for the demo.
- **Tailwind removal:** if anything else in the repo depends on Tailwind utilities, keep `@tailwind base` (reset) and layer the design system on top rather than ripping it out.
- **Two artifacts had no notes** (intents, intent-detail) — their raw bodies are authoritative; double-check responsive behavior since they didn't get a "refine next" pass.
```
