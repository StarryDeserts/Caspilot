# Caspilot Frontend — Open Design Build Plan

> 中文导读：这份文档是给 [Open Design](https://github.com/nexu-io/open-design) 用的「设计施工图」。
> 用法：先把第 2 节的 **Caspilot DESIGN.md** 作为设计系统导入（顶部 *Design system* 选 `caspilot`），
> 然后把第 6 节里每个页面的 **PROMPT** 当作 brief 逐页生成（每页一个 artifact）。
> 第 3–5 节解释了「为什么是这些页面 / 这些组件 / 它们之间如何联动」，第 7 节是建议的生成顺序。

This document turns the Caspilot product into an Open Design build plan. It contains:

1. How Open Design consumes this document (workflow + which skill to pick per page).
2. The shared **`DESIGN.md`** brand contract — paste once, every page inherits it.
3. The **sitemap** — how many pages and why (each one closes a real gap found in the current `apps/web` audit).
4. The shared **component library** every page draws from.
5. The global **interaction & state model** — how components talk to each other (the part the current UI is missing).
6. **Per-page prompts** — copy-paste briefs, one per page.
7. Suggested **build order**.

Everything is grounded in the real backend: the intent FSM states, the `caspilot-api` endpoints, the security model (signer separation, redacted audit trace, no secrets in the browser), and the real on-chain proof on `casper-test`.

---

## 1. How to use this with Open Design

Open Design's loop is: **brief → (DESIGN.md + skill) → streamed real-CSS artifact → click-to-comment refinement**. So:

1. **Install the design system.** Drop section 2 into `design-systems/caspilot/DESIGN.md` (or paste it into the top-bar *Design system* slot). Every skill then reads it as part of its system prompt, so all pages share one brand.
2. **Generate one artifact per page.** For each page in section 6, start a new artifact, select the **recommended skill**, and paste the **PROMPT** block verbatim. The prompt is self-contained (it restates the brand cues) so a page still renders correctly if run standalone.
3. **Refine by region.** After the first render, use comment-mode on the regions flagged under each prompt's *Refine next* list rather than re-prompting the whole page.
4. **Keep the data real.** Every prompt ships real-shaped sample data (account-hash hex `00…`, `cspr-test-cep18`, `casper:casper-test`, 64-hex deploy hashes, `testnet.cspr.live` links). Do not let the model invent ETH addresses or mainnet data — Caspilot is Casper `casper-test` only.

**Recommended skill per artifact type** (all bundled in Open Design):

| Artifact | Skill | Why |
|---|---|---|
| Landing page | `poster-hero` → then `web-artifacts-builder` | Hero-grade marketing surface, then full-page build |
| App console / dashboards | `ui-ux-pro-max` or `web-artifacts-builder` | Dense, stateful product UI |
| Data tables & detail views | `web-artifacts-builder` + `shadcn-ui` | Tables, badges, steppers, forms |
| Developer / API page | `web-artifacts-builder` + `web-design-guidelines` | Docs-grade layout with code blocks |
| The DESIGN.md itself | `brand-guidelines` | If you want to regenerate/extend the system |

---

## 2. The Caspilot Design System (`DESIGN.md`)

> Paste this whole block as `design-systems/caspilot/DESIGN.md`. It follows Open Design's 9-section schema.

```markdown
# Design System — Caspilot

> Category: Themed & Unique
> A control-room instrument panel for autonomous capital. Every screen is a
> cockpit where an AI agent proposes, a policy/signer authorizes, and the
> Casper chain executes — so the UI reads like trustworthy aerospace
> telemetry, not a generic crypto dashboard.

## 1. Visual Theme & Atmosphere

Caspilot is the cockpit for an autonomous DeFi agent. The mood is
"precise, accountable, alive": an obsidian control surface with a single
molten-amber signal that means *authority is being exercised*. Think
mission-control telemetry crossed with a private-bank ledger — calm dark
canvas, hairline ledger rules, monospaced machine annotations, and one hot
accent reserved for the moment an action is authorized or executed.

- **Visual style:** dark, precise, instrument-grade; restrained maximalism in data, minimalism in chrome
- **Color stance:** deep obsidian canvas with layered charcoal surfaces; one decisive warm accent
- **Design intent:** make autonomy feel *legible and governed*. The user must always see what the agent proposed, what the policy allowed, and what the chain did — never a black box.

## 2. Color

- **Canvas:** `#0A0A0B` — near-black obsidian; the base of every screen.
- **Surface:** `#141417` — raised cards/panels.
- **Surface-2:** `#1C1C21` — nested panels, table header, code blocks.
- **Hairline:** `#2A2A31` — 1px ledger rules and borders.
- **Text:** `#ECECEE` — primary copy on canvas.
- **Text-muted:** `#9A9AA3` — labels, timestamps, secondary copy.
- **Accent (Authorize):** `#FF5A1F` — molten amber. The ONE focal color: primary CTAs, the active step in a flow, the "execute/authorize" signal, focus rings.
- **Accent-dim:** `#7A2E12` — accent at rest / pressed / glow base.

Semantic state colors (reserved strictly for the intent FSM badges and status, never decoration):

- **Validated (policy passed):** `#3B82F6`
- **Payment:** `#D97706`
- **In-flight (submitting / accepted by node):** `#6366F1`
- **Executed / finalized (success):** `#16A34A`
- **Failed / rejected / timeout (terminal-bad):** `#DC2626`

Rules:
- Amber `#FF5A1F` appears at most once or twice per viewport — it is the eye's anchor, not a theme.
- State colors only ever appear inside a `StateBadge`, a stepper node, or a status dot. Never tint a whole panel with them.
- Addresses, hashes, and amounts always render in mono on `Surface-2`, never colored.

## 3. Typography

- **Scale:** 12 / 14 / 16 / 20 / 28 / 40 / 56
- **Families:** display=Bricolage Grotesque; primary(body)=Hanken Grotesk; mono=JetBrains Mono
- **Weights:** display 600–800 for headlines; body 400/500; mono 400/500
- Headlines use Bricolage Grotesque for character (slightly mechanical, condensed energy). Body uses Hanken Grotesk for calm legibility. **All machine data — account hashes, deploy hashes, token ids, atomic amounts, chain ids, timestamps — uses JetBrains Mono.** The mono/sans split is the core typographic signal: prose is human, mono is machine truth.
- Numbers in tables and meters are tabular (`font-variant-numeric: tabular-nums`).

## 4. Spacing & Grid

- **Spacing scale:** 8pt baseline (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64).
- App pages use a 12-column grid inside a max-width of 1200px content rail; the marketing landing may break to full-bleed.
- Consistent 24px panel padding; 12px between stacked list rows; 16px control gaps.
- Hairline rules (not heavy borders) separate ledger rows and table sections — evoke an accounting sheet.

## 5. Layout & Composition

- **App shell:** fixed left sidebar (nav) + top bar (network pill, health dot, wallet button) + scrollable content rail. Every authenticated page lives inside this shell.
- Lead each view with: page title → one-line purpose → primary action (top-right) → content.
- Detail pages are two-column on desktop: the **state/flow column** (stepper + actions) and the **evidence column** (audit trace + on-chain proof). Stack to one column on mobile.
- Micro-annotations (monospace, `Text-muted`, 12px) sit in panel corners: chain id, env, last-synced time — the "instrument label" texture.

## 6. Components

- **Buttons:** primary = solid amber `#FF5A1F` on dark, 500 weight; secondary = `Surface-2` with hairline border; destructive = outline in `#DC2626`. Every button has explicit hover / focus-visible (amber ring) / active / disabled / **loading (spinner + label swap)** states.
- **Inputs:** dark `Surface-2` field, hairline border, amber focus ring, mono font for hex/amount fields, inline error text in `#DC2626` below the field. Labels always visible (no placeholder-as-label).
- **StateBadge:** small pill, semantic color by FSM state, uppercase mono label.
- **FSM Stepper:** horizontal node rail for the intent lifecycle; completed = filled state color, current = amber pulse, future = `Hairline`.
- **Cards/panels:** `Surface`, 12px radius, 24px padding, optional 1px `Hairline`; elevation via subtle shadow + a faint top inner-glow, never heavy drop shadows.
- **Tables:** header on `Surface-2`, hairline row rules, hover row highlight, mono for data columns, right-aligned tabular numbers.
- **Toast/inline alert:** surfaces the server's real reason (e.g. a 422 policy denial), never a bare status code.

## 7. Motion & Interaction

- Default transitions 150–250ms, ease-out; the amber accent is the interaction signal.
- **Signal moments** (use deliberate, slightly longer ~300ms motion): a stepper node advancing, an audit entry appearing, an on-chain proof card resolving from "pending" to "verified." These should feel earned.
- The active/execution element may carry a soft amber glow pulse (2s, subtle) — exactly one per screen.
- Numbers that change (spend used, caps) tick/roll rather than snap.
- Polling updates fade-in new trace rows from the top; never reflow the whole list.
- Respect `prefers-reduced-motion`: replace pulses/rolls with instant state changes.

## 8. Voice & Brand

- Tone: precise, accountable, quietly confident. We are custodians of delegated authority, not hype.
- Microcopy is literal and action-oriented: "Validate policy", "Authorize & sign", "Reject intent", "Verified on casper-test".
- Always name the guarantee near the action: "The backend never sees your private key." "Trace is redacted — reasoning never leaves the agent."
- Headlines may carry personality ("Autonomy you can audit"); UI labels stay literal.
- Casper network is always shown as `casper:casper-test` in mono; never imply mainnet.

## 9. Anti-patterns

- No purple-on-white gradients, no glassmorphism clichés, no generic crypto neon.
- Do not use Inter, Roboto, Arial, or Space Grotesk; do not flatten the mono/sans split.
- Do not spread the amber accent across many elements — it must stay the single focal signal.
- Do not tint whole panels with semantic state colors; states live in badges/steppers only.
- Never render an address/hash/amount in a proportional font.
- Never invent EVM addresses, ETH, or mainnet data. Casper `casper-test` only.
- Never show raw chain-of-thought / agent reasoning — the trace is redacted by design; reflect that in the UI.
```

---

## 3. Sitemap — how many pages, and why

Seven pages plus one global shell. Each one closes a specific gap from the current `apps/web` audit (no navigation; the intent FSM can't be driven from the UI; `validatePolicy`/`reject` implemented but never called; CSPR.click `wallet.ts` unwired; no loading/empty/error states; the detail page swallows errors).

| # | Page | Route | Priority | Skill | Closes audit gap |
|---|---|---|---|---|---|
| 0 | **App Shell** (nav + top bar + wallet) | wraps `/app/**` | P0 | `web-artifacts-builder` | "No navigation / IA at all" |
| 1 | **Landing** | `/` | P0 (judge funnel) | `poster-hero` + `web-artifacts-builder` | Dead-end splash → real story + CTA |
| 2 | **Console / Dashboard** | `/app` | P0 | `ui-ux-pro-max` | No home; gives overview + entry points |
| 3 | **Intents — list + create** | `/app/intents` | P0 (demo core) | `web-artifacts-builder` + `shadcn-ui` | Can't see/start intents; no list→detail nav |
| 4 | **Intent detail** | `/app/intents/[id]` | P0 (demo star) | `web-artifacts-builder` | FSM not drivable; trace; on-chain proof; error-swallowing |
| 5 | **PolicyVaults — list + create + sign** | `/app/vaults` | P1 | `web-artifacts-builder` | CSPR.click sign flow unwired |
| 6 | **Vault detail** | `/app/vaults/[id]` | P2 | `web-artifacts-builder` | Scoped policy + spend ledger + revoke |
| 7 | **Developers / x402 API** | `/developers` | P1 | `web-artifacts-builder` + `web-design-guidelines` | Surfaces the paid-agent-API product line |

**Two product lines, one IA:** the **Console → Intents → Intent detail** spine is the *x402-paid agent* line (an agent proposes a payment intent, policy authorizes, chain executes). **Vaults** is the *delegated PolicyVault* line (a human delegates scoped authority and signs with CSPR.click). **Developers** documents how an external agent pays to call the API. Landing sells all three and funnels to the Console.

---

## 4. Shared component library

Every page composes these. Build them once (the shell page establishes them); reference them by name in later prompts so Open Design keeps them consistent.

**Chrome**
- `AppShell` — fixed left sidebar (Dashboard, Intents, Vaults, Developers, each with icon + label + active state) + top bar.
- `NetworkPill` — mono `casper:casper-test`, small dot; click → no-op tooltip "Testnet only".
- `HealthDot` — green/amber/red dot reflecting API `/healthz`; tooltip shows last check.
- `WalletButton` — CSPR.click connect; idle = "Connect CSPR.click"; connected = truncated public key `01a2…9f` in mono + disconnect on click. **Never shows a private key** (reflects `wallet.ts` guarantee).

**Intent domain**
- `StateBadge` — the 12 FSM states with semantic colors (see DESIGN.md §2): `DRAFT, POLICY_VALIDATED, PAYMENT_REQUIRED, PAYMENT_VERIFIED, READY_TO_SUBMIT, SIGNED_RECEIVED, ACCEPTED_BY_NODE, EXECUTED, FINALIZED, EXECUTION_FAILED, REJECTED, TIMEOUT`.
- `FSMStepper` — horizontal lifecycle rail; highlights current state, dims future, marks terminal-bad in red.
- `IntentTable` — columns: short id, agent, receiver, token, amount (right, tabular mono), state badge, updated; row hover; row click → detail.
- `IntentForm` — fields agent / receiver / token / contract / amount (network prefilled `casper:casper-test`); inline hex/decimal validation; submit shows loading; success emits a toast + the new row.
- `ActionBar` — **state-gated** action buttons on the detail page: `DRAFT`→[Validate policy] [Reject]; `POLICY_VALIDATED`→[Mark executed (demo)] [Reject]; terminal→actions disabled with a reason. Each button: loading + disabled states.
- `AuditTraceTimeline` — reverse-chronological redacted entries `{atMs, state, kind, payload}`; payload in mono on `Surface-2`; a "redacted" chip where reasoning would be; new rows fade in from top.
- `PaymentPanel` (x402) — amount due, "402 Payment Required" explainer, pay button, verified check.
- `OnchainProofCard` — pending → verified transition; shows 64-hex deploy hash (mono, copyable) + `testnet.cspr.live/deploy/<hash>` link + block/finality; the amber "verified" moment.

**Vault domain**
- `VaultCard` — admin, CEP-18 contract, max single / daily caps, valid-until; status.
- `VaultForm` — admin / cep18Contract / maxSinglePayment / dailyLimit / validUntil(date).
- `SignFlow` — modal stepper: (1) Review deploy payload → (2) Connect CSPR.click → (3) Sign in popup → (4) Submit; reassurance line "backend never sees the key".
- `SpendMeter` — daily cap used vs remaining (rolling number + bar); single-payment cap chip.

**Utility**
- `Toast` / `InlineAlert` — success + error; error renders the server's real message.
- `EmptyState`, `NotFound`, `Skeleton` — for empty lists, bad ids, and loading.

---

## 5. Global interaction & state model

This is the layer the current UI lacks — how components coordinate. Bake these rules into every app-page prompt.

**Wallet & network (shared, top bar)**
- `WalletButton` state is global: connecting on one page reflects everywhere. Connected key is mono-truncated; the full key is never printed and the private key never crosses the boundary.
- `NetworkPill` + `HealthDot` are always visible; `HealthDot` polls `/healthz` and degrades gracefully (amber = slow, red = down) instead of silently failing.

**The golden demo path (the flow judges will watch)**
1. Landing `/` → click **Launch console** → `/app`.
2. Console → **New intent** → `IntentForm` (prefilled with the canonical demo intent: agent `00aa…`, receiver `00bb…`, token `cspr-test-cep18`, contract `00cc…`, amount `500`).
3. Submit → button shows loading → success **toast** with new id → row appears in `IntentTable` as `DRAFT` → auto-navigate to **Intent detail**.
4. Detail `DRAFT` → `ActionBar` shows **Validate policy**. Click → loading → on success: `FSMStepper` advances to `POLICY_VALIDATED`, a new `AuditTraceTimeline` row fades in (`kind: policy_check, allowed: true, policyDigest …`), and `ActionBar` reveals the next action.
   - On policy denial (e.g. amount over cap) → `StateBadge` flips to `REJECTED`, an **error toast** shows the server's real 422 reason, and the trace records the denial. (This is the security story made visible.)
5. **Mark executed (demo fast-forward)** → enter a 64-hex deploy hash → `EXECUTED`; `OnchainProofCard` resolves pending → **verified**, with the `testnet.cspr.live` link. Amber moment.
6. Detail polls the trace every 2s **and stops on any terminal state** (`EXECUTED/FINALIZED/REJECTED/EXECUTION_FAILED/TIMEOUT`). A bad id renders `NotFound`, a fetch error renders `InlineAlert` — never a silently empty list.

**Vault path (second product line)**
- `/app/vaults` → **New vault** → `VaultForm` → **Draft deploy** → `SignFlow` modal: review payload → `WalletButton` connect → CSPR.click sign popup → submit → vault appears in list. The page always states "the backend never sees the private key."

**Conventions (apply to every async action)**
- Loading: button swaps label for spinner + "…", stays disabled; double-submit impossible.
- Empty: `EmptyState` with the primary action, not a blank panel.
- Error: `InlineAlert`/`Toast` with the server message from the API client; never swallow.
- Success: `Toast` + optimistic UI update + (where natural) navigation.
- Terminal: stop polling, freeze actions with an explanatory disabled reason.

---

## 6. Per-page Open Design prompts

Each page below has a **meta block** (route / skill / goal) and a fenced **PROMPT** to paste into Open Design. Prompts assume the `caspilot` design system is selected; they restate key brand cues so they also work standalone.

---

### 6.0 — Global App Shell

**Route:** wraps `/app/**` · **Skill:** `web-artifacts-builder` · **Goal:** establish nav + top bar + wallet so no page is an island.

```text
Build the Caspilot application shell as a single responsive HTML artifact using the Caspilot design system (obsidian #0A0A0B canvas, molten-amber #FF5A1F single accent, Bricolage Grotesque headlines / Hanken Grotesk body / JetBrains Mono for all machine data).

Layout: a fixed left sidebar (240px) + a 56px top bar + a scrollable content rail (max-width 1200px, centered).

Left sidebar:
- Caspilot wordmark at top (Bricolage Grotesque, 600), with a 12px mono tagline beneath it: "autonomy you can audit".
- Nav items, each icon + label, with a clear active state (amber left-edge bar + brighter text): Dashboard, Intents, Vaults, Developers.
- Pin a small footer block at the bottom: env label "casper:casper-test" in mono and a build hash chip.

Top bar (right-aligned cluster):
- NetworkPill: mono "casper:casper-test" with a small dot; tooltip "Testnet only".
- HealthDot: a status dot (green "healthy") with tooltip "API /healthz · last checked 2s ago".
- WalletButton: idle state shows "Connect CSPR.click" (amber outline); show a second mockup of the connected state to the right for reference: a mono truncated key "01a2…9f" with a caret. Never display a private key.

Fill the content rail with a placeholder page title "Dashboard", a one-line muted purpose, and a top-right primary amber button "New intent", so the shell reads as a real product frame.

Interaction states to render explicitly: nav hover + active; button hover / focus-visible (amber ring) / disabled / loading (spinner + label swap); WalletButton idle vs connected. Motion 150–250ms ease-out. Honor prefers-reduced-motion.

Anti-slop: no purple, no glassmorphism, no Inter/Space Grotesk, amber appears at most twice. Hairline #2A2A31 rules, not heavy borders. Add subtle monospace instrument labels (env, last-synced) in panel corners.

Refine next: sidebar active state, WalletButton connected variant, HealthDot degraded (amber/red) variants.
```

---

### 6.1 — Landing (`/`)

**Route:** `/` · **Skill:** `poster-hero` then `web-artifacts-builder` · **Goal:** sell "AI proposes / policy authorizes / chain executes" to hackathon judges in 10 seconds and funnel to the console + demo.

```text
Design the Caspilot landing page as a single full-bleed responsive HTML artifact using the Caspilot design system (obsidian #0A0A0B canvas, ONE molten-amber #FF5A1F accent, Bricolage Grotesque display / Hanken Grotesk body / JetBrains Mono for data). Audience: hackathon judges and agent developers. Tone: precise, accountable, quietly confident — mission-control for autonomous capital, not crypto hype.

Sections, top to bottom:

1. HERO (full viewport). Eyebrow in mono: "CASPER · casper-test". Headline in Bricolage Grotesque, 56px, two lines: "Autonomy you can audit." Sub: "Caspilot is an autonomous DeFi-yield agent on Casper. The AI proposes, a policy and signer authorize, the chain executes — and every step is on the record." Two buttons: primary amber "Launch console" and secondary "Watch the demo". Behind the headline, a restrained atmosphere: faint ledger grid + a soft amber glow behind the primary CTA only. One live-looking telemetry chip in the corner (mono): "last deploy · casper-test · 0x… · verified".

2. THE MODEL (three steps, equal cards). Title "AI proposes · Policy authorizes · Chain executes". Card 1 "Propose" — the agent drafts a payment intent (show a tiny mono intent: token cspr-test-cep18, amount 500). Card 2 "Authorize" — a SignerGuard policy checks caps + allowlist before anything signs; the agent never holds keys. Card 3 "Execute" — a detached signature broadcasts to casper-test; result is verifiable. Use the FSM colors only inside small badges (DRAFT → POLICY_VALIDATED → EXECUTED), nowhere else.

3. TWO PRODUCT LINES (two columns). Left "x402-paid agent API" — agents pay per call (CEP-18 + EIP-712), policy-gated intent lifecycle. Right "Delegated PolicyVault" — a human delegates scoped authority and signs with CSPR.click; the backend never sees the key. Each column has a literal feature list and a quiet "Learn more" link.

4. SECURITY MODEL (dark band). Four hairline-separated guarantees, each one line: "Signer separation — the API never broadcasts." "Redacted audit trace — reasoning never leaves the agent." "No secrets in the browser — bundle-checked." "Real on-chain proof — every demo ends in a casper-test deploy hash." Render a real-shaped deploy hash in mono with a testnet.cspr.live link.

5. PROOF STRIP. A horizontal row of mono stat chips: "12 FSM states", "casper-test verified", "0 keys in API", "305+ tests". Understated, tabular.

6. FOOTER CTA. Repeat "Launch console" (amber) + a GitHub link. Minimal footer.

Motion: one orchestrated page-load with staggered reveals (hero eyebrow → headline → sub → buttons, ~80ms stagger). Hover lifts on cards. The amber glow behind the primary CTA pulses subtly (2s), the only pulse on the page. Honor prefers-reduced-motion.

Anti-slop: no purple gradients, no stock 3D blobs, no Inter/Space Grotesk; amber is the single focal color; everything else is obsidian + charcoal + hairlines + mono. Numbers tabular. Keep it editorial and instrument-grade.

Refine next: hero atmosphere/glow, the three-step "model" cards, the security band typography.
```

---

### 6.2 — Console / Dashboard (`/app`)

**Route:** `/app` · **Skill:** `ui-ux-pro-max` · **Goal:** the real home — overview + fast entry into both product lines (replaces the dead-end splash).

```text
Design the Caspilot Console (dashboard home) as an HTML artifact inside the Caspilot app shell (fixed left sidebar + top bar with NetworkPill, HealthDot, WalletButton). Use the Caspilot design system: obsidian canvas, single amber accent, Bricolage/Hanken/JetBrains Mono.

Header row: page title "Console", one-line muted purpose "Propose, authorize, and execute agent intents on casper-test.", top-right primary amber button "New intent" and a secondary "New vault".

Content (12-col grid):

1. STATUS STRIP — four compact stat cards in mono tabular numbers: "Active intents · 3", "Awaiting policy · 1", "Executed today · 2", "Daily cap used · 1,200 / 100,000". The cap card shows a thin amber progress bar.

2. RECENT INTENTS — a panel titled "Recent intents" with a compact IntentTable (columns: id "int_3hdp…", agent "00aa…", token "cspr-test-cep18", amount right-aligned tabular, StateBadge, updated "12s ago"). Five rows across DRAFT, POLICY_VALIDATED, EXECUTED, REJECTED states so all badge colors appear. Row hover highlight; whole row is a link to the intent detail. A "View all" link to /app/intents in the panel header. If empty, show an EmptyState with a "New intent" button instead.

3. VAULTS SNAPSHOT — a smaller panel "PolicyVaults" with two VaultCards (admin 00aa…, CEP-18 00cc…, max single 500, daily 100,000, valid until a date) and a SpendMeter showing used vs remaining. "Manage vaults" link.

4. SECURITY/PROVENANCE FOOTER — a single hairline-bordered strip with three mono guarantees: "signer separation", "redacted trace", "no keys in browser". Quiet, reassuring.

Interaction & states: every primary action has hover / focus-visible (amber ring) / disabled / loading. Stat numbers roll on load. New table rows fade in from the top. Honor prefers-reduced-motion. Loading variant: show skeleton rows in the table and shimmer in the stat cards.

Anti-slop: state colors only inside badges/meters; amber only on the primary CTA and the cap bar; hairlines not heavy borders; all ids/hashes/amounts in mono.

Refine next: status strip cap bar, IntentTable row + badge styling, vault snapshot cards.
```

---

### 6.3 — Intents: list + create (`/app/intents`)

**Route:** `/app/intents` · **Skill:** `web-artifacts-builder` + `shadcn-ui` · **Goal:** see every intent and start a new one — with real validation and async states.

```text
Design the Caspilot Intents page (list + create) as an HTML artifact inside the app shell, Caspilot design system.

Header: title "Intents", purpose "Every payment intent your agent proposed, and where the policy took it.", top-right primary amber "New intent" button that opens a right-side drawer (not a separate page).

LIST: a full-width IntentTable. Columns: Intent (mono short id "int_3hdp2en…"), Agent ("00aa…"), Receiver ("00bb…"), Token ("cspr-test-cep18"), Amount (right-aligned, tabular mono), State (StateBadge), Updated ("just now", "2m ago"). Sticky header on Surface-2, hairline row rules, hover highlight, the whole row links to /app/intents/[id]. Above the table: a filter row — segmented control by state group (All · Draft · Validated · Executed · Rejected) and a search input for id/agent. Show ~8 rows covering DRAFT, POLICY_VALIDATED, PAYMENT_REQUIRED, EXECUTED, REJECTED so every badge color is visible. Provide an EmptyState ("No intents yet — propose your first") and a Skeleton loading variant.

CREATE DRAWER (slides from right, 420px): title "New intent". Fields (IntentForm), each with a visible label, dark field, mono input for hex/amount, amber focus ring, inline error beneath:
- Agent (account-hash hex, 00 + 64 hex) — prefilled "00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
- Receiver (account-hash hex) — prefilled "00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
- Token — prefilled "cspr-test-cep18"
- Contract (account-hash hex) — prefilled "00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
- Network — fixed mono chip "casper:casper-test" (read-only)
- Amount (decimal string) — prefilled "500"
Validation: agent/receiver/contract must match 00 + 64 hex; amount must be digits. Show a real inline error example under Amount ("amount must be a decimal string"). Submit button "Create intent" (amber): on click → loading spinner + disabled (no double submit); on success → drawer closes, a success Toast "Intent int_3hdp… created" appears, the new row animates in at the top of the table as DRAFT, and the app navigates to its detail. On server error → an InlineAlert inside the drawer with the server's actual message (e.g. "createIntent 422: …"), drawer stays open.

Motion 150–250ms; new row fade-in from top; drawer slide. Honor prefers-reduced-motion.

Anti-slop: badges carry the only state color; amber only on the primary button + focus ring; mono for all ids/hex/amounts; hairlines.

Refine next: filter segmented control, the create drawer form + error state, the success toast + row insert.
```

---

### 6.4 — Intent detail (`/app/intents/[id]`)

**Route:** `/app/intents/[id]` · **Skill:** `web-artifacts-builder` · **Goal:** the demo star — drive the FSM, watch the redacted trace, prove it on-chain. Fixes the unwired actions + error-swallowing.

```text
Design the Caspilot Intent Detail page as an HTML artifact inside the app shell, Caspilot design system. This is the cockpit for one intent and the centerpiece of the demo.

Header: breadcrumb "Intents / int_3hdp2enbaqglke1jv7e1avk3d9" (id in mono), a large StateBadge for the current state, and a copy-id button. One-line purpose: "Propose → authorize → execute, fully on the record."

Below the header, a full-width FSM STEPPER showing the lifecycle as nodes: DRAFT → POLICY_VALIDATED → PAYMENT_REQUIRED → PAYMENT_VERIFIED → READY_TO_SUBMIT → SIGNED_RECEIVED → ACCEPTED_BY_NODE → EXECUTED → FINALIZED. Completed nodes filled in their state color, the current node ("POLICY_VALIDATED" for this mock) pulsing amber, future nodes in hairline gray. Terminal-bad states (REJECTED / EXECUTION_FAILED / TIMEOUT) shown as a red off-ramp.

Two-column body (stack on mobile):

LEFT — STATE & ACTIONS:
- A "Proposed intent" panel: the intent fields in a mono key/value grid (agent 00aa…, receiver 00bb…, token cspr-test-cep18, contract 00cc…, network casper:casper-test, amount 500).
- An ActionBar whose buttons are GATED by current state. For POLICY_VALIDATED show: primary amber "Mark executed (demo)" and secondary outline-red "Reject intent". (For reference, render a second small variant showing the DRAFT state with "Validate policy" + "Reject".) Each button has hover / focus-visible / disabled / loading. Disabled actions show a reason tooltip ("Already validated").
- A PaymentPanel (x402): a compact card "x402 · Payment" explaining "402 Payment Required" with amount due in mono and a "Pay & verify" button; show the verified check state too.
- A "Reject" action opens a small confirm with a reason field; the confirm button surfaces the server message on error.

RIGHT — EVIDENCE:
- OnchainProofCard at the top: two variants stacked for reference — PENDING ("awaiting broadcast on casper-test", subtle spinner) and VERIFIED (amber check, 64-hex deploy hash in mono with copy, a "View on testnet.cspr.live" link, block height + finality). The pending→verified transition is the key amber moment.
- AuditTraceTimeline below: reverse-chronological redacted entries. Each row: a StateBadge, a mono ISO timestamp, a kind label (created, policy_check, executed), and an expandable mono payload on Surface-2. Show entries: {state: DRAFT, kind: created, payload: {body:{token, amount, …}}} and {state: POLICY_VALIDATED, kind: policy_check, payload: {allowed: true, policyDigest: "bfc091a0…"}}. Where agent reasoning would be, show a muted "redacted" chip with tooltip "reasoning never leaves the agent". New rows fade in from the top.

Live behavior to depict: a small "live · polling every 2s" mono label near the trace, with a note that polling STOPS at terminal states. Also render the two failure UIs as reference: a NotFound state ("No intent with id … — it may have been pruned") and an InlineAlert error ("Couldn't load trace · getTrace 503"). Never an empty list masquerading as success.

Motion: stepper node advance ~300ms with an amber sweep; proof card pending→verified resolve; trace rows fade-in. Honor prefers-reduced-motion (swap pulses for instant state).

Anti-slop: amber appears only on the current step + primary action + verified proof; state colors only in badges/stepper; all machine data mono; hairlines; no decorative gradients.

Refine next: FSM stepper, OnchainProofCard verified state, AuditTraceTimeline redacted rows, the gated ActionBar states.
```

---

### 6.5 — PolicyVaults: list + create + sign (`/app/vaults`)

**Route:** `/app/vaults` · **Skill:** `web-artifacts-builder` · **Goal:** the delegated-authority line — draft a vault and walk the CSPR.click connect→sign→submit flow (wires `wallet.ts`).

```text
Design the Caspilot PolicyVaults page as an HTML artifact inside the app shell, Caspilot design system.

Header: title "PolicyVaults", purpose "Delegate scoped authority. You sign with CSPR.click — the backend never sees your private key.", top-right primary amber "New vault".

LIST: a responsive grid of VaultCards. Each card: admin (mono 00aa…), CEP-18 contract (mono 00cc…), a SpendMeter (daily cap used vs remaining with a thin amber bar + rolling tabular number), a "max single payment" chip (500) and a "valid until" date, plus a status badge (Active / Expired). Card hover lift; whole card links to /app/vaults/[id]. Show 2–3 cards. Provide an EmptyState ("No vaults yet — delegate your first").

CREATE → SIGN FLOW: "New vault" opens a modal that is a 4-step SignFlow stepper (the steps shown as an amber-progress rail at the top of the modal):
1. DRAFT — the VaultForm: fields admin (account-hash hex 00+64), CEP-18 contract (account-hash hex), max single payment (decimal), daily limit (decimal), valid until (date). Visible labels, mono inputs for hex/decimals, amber focus rings, inline errors ("admin must be an account-hash hex (00<64 hex>)"). Primary button "Draft deploy".
2. REVIEW — show the drafted deploy payload as pretty mono JSON on Surface-2, with a one-line reassurance "This is what you'll sign. The backend never sees your key." Buttons: back + "Connect wallet".
3. CONNECT — the WalletButton flow: idle "Connect CSPR.click" → connecting spinner → connected shows a mono truncated public key "01a2…9f". A guard note: "If the provider tries to expose a private key or CSPR_CLOUD_KEY, Caspilot refuses to use it." Button "Sign deploy".
4. SIGN & SUBMIT — a "waiting for CSPR.click popup" state (subtle pulse), then a success state with the returned signature hex (mono, truncated) and a "Submit to casper-test" button → loading → success Toast "Vault created" and the modal closes; the new VaultCard animates into the grid.

Failure states to render: a connect error InlineAlert ("CSPR.click provider missing — install the browser SDK"), and a sign-rejected state ("Signature declined in wallet").

Motion: modal step transitions (amber progress fills), card insert fade-in, SpendMeter number roll. 150–250ms; honor prefers-reduced-motion.

Anti-slop: amber on the active step + primary button + meter bar only; mono for all hex/amounts/signatures; hairlines; no neon, no glass.

Refine next: the SignFlow stepper + each step, VaultCard + SpendMeter, the wallet-guard reassurance copy.
```

---

### 6.6 — Vault detail (`/app/vaults/[id]`)

**Route:** `/app/vaults/[id]` · **Skill:** `web-artifacts-builder` · **Goal:** inspect one vault's scoped policy, spend ledger, and revoke.

```text
Design the Caspilot Vault Detail page as an HTML artifact inside the app shell, Caspilot design system.

Header: breadcrumb "PolicyVaults / vault_7af3… ", an Active/Expired status badge, top-right destructive outline-red button "Revoke vault" (opens a typed-confirm dialog; the confirm surfaces the server message on error).

Two-column body (stack on mobile):

LEFT — SCOPED POLICY (the contract of delegated authority): a mono key/value panel — admin (00aa…), CEP-18 contract (00cc…), allowed token (cspr-test-cep18), receiver allowlist (00bb…), max single payment (500), daily cap (100,000), valid until (date), signer role (local_dev). Each row hairline-separated like a ledger.

RIGHT — SPEND LEDGER:
- A large SpendMeter: daily cap used vs remaining (rolling tabular numbers + amber bar), and a single-payment-cap chip. A small mono "resets in 14h 22m".
- A "Recent debits" mini-table: timestamp (mono ISO), receiver (00bb…), amount (right tabular), and the linked intent id (int_…). Hairline rows. EmptyState if none.

FOOTER STRIP: three mono guarantees — "reserve → commit ledger (replay-protected)", "signer separation", "scoped to assets routed through this vault".

Interaction & states: Revoke = typed confirm + loading + error surfacing. Numbers roll on load. Skeleton variant for loading; NotFound variant ("No vault with id …").

Anti-slop: amber only on the meter bar; state color only in the status badge; mono for all data; hairlines; no decorative color.

Refine next: SpendMeter, the scoped-policy ledger panel, the revoke confirm.
```

---

### 6.7 — Developers / x402 API (`/developers`)

**Route:** `/developers` · **Skill:** `web-artifacts-builder` + `web-design-guidelines` · **Goal:** make the paid-agent-API line concrete for developers — how an agent pays to call Caspilot.

```text
Design the Caspilot Developers page (x402 API reference) as a docs-grade HTML artifact using the Caspilot design system. It can sit outside the app shell (its own top bar with the wordmark + "Launch console" button) since developers may land here directly.

Layout: a left in-page anchor nav (Overview, Authentication, The x402 flow, Create intent, Validate policy, Get trace, Errors) + a wide content column with generous reading measure.

Sections:
1. OVERVIEW — "Caspilot exposes a policy-gated intent API. Agents pay per call with x402 (CEP-18 + EIP-712 over casper-test). The agent never holds Caspilot's keys; Caspilot never broadcasts on the agent's behalf without policy approval." A mono base-URL chip "https://api.caspilot… · casper-test".
2. THE x402 FLOW — a 4-step horizontal diagram: request → 402 Payment Required (quote) → pay (CEP-18 transfer + EIP-712 receipt) → retry with proof → 200. State colors only in tiny step badges.
3. ENDPOINTS — for each, a two-pane row: left = method + path + description; right = a mono code block (request + response). Use the REAL shapes:
   - POST /intents → 201 {"id":"int_3hdp2en…","state":"DRAFT"} with the demo body (agent 00aa…, receiver 00bb…, token cspr-test-cep18, contract 00cc…, network casper:casper-test, amount "500").
   - POST /intents/:id/validate-policy → 200 {"id":"int_…","state":"POLICY_VALIDATED","policyDigest":"bfc091a0…"} ; and the denial 422 with a real reason.
   - GET /intents/:id/trace → 200 {"id":"int_…","entries":[{"atMs":…,"state":"DRAFT","kind":"created","payload":{…}}, {"state":"POLICY_VALIDATED","kind":"policy_check","payload":{"allowed":true,"policyDigest":"…"}}]} — note "payloads are redacted; agent reasoning never appears".
   - POST /intents/:id/reject → 200.
   Each code block has a copy button (hover-reveal) and a tiny "casper-test" tag.
4. ERRORS — a hairline table: 402 Payment Required, 422 Policy denied (with example reason), 404 Unknown intent, 503 Upstream. Emphasize that error bodies carry a human-readable reason, not just a status.
5. SECURITY NOTE — a dark band repeating: signer separation, redacted trace, replay-protected payment ledger, no secrets in client bundles.

Typography: prose in Hanken Grotesk with a comfortable measure; every code block, path, id, hash, and field name in JetBrains Mono on Surface-2. Syntax-tint JSON keys subtly (muted), strings in slightly brighter text — but NO rainbow highlighting.

Motion: anchor-nav active section tracking; copy-button confirmation ("copied"); 150–250ms. Honor prefers-reduced-motion.

Anti-slop: amber only on the "Launch console" CTA + copy confirmation; no purple; mono everywhere data appears; hairlines; editorial docs feel, not a marketing page.

Refine next: the x402 flow diagram, the endpoint two-pane code blocks, the errors table.
```

---

### 6.8 — Brand mark (SVG logo)

**Asset:** brand mark + wordmark (not a page) · **Skill:** `brand-guidelines` · **Goal:** a distinctive, favicon-survivable SVG logo that encodes "autonomy you can audit" and feeds the wordmark used in the App Shell (6.0) and Landing (6.1).

```text
Design the Caspilot brand mark and wordmark as a single responsive HTML artifact that renders real, inline, hand-editable SVG (not raster, no base64) using the Caspilot design system: obsidian #0A0A0B canvas, ONE molten-amber #FF5A1F accent, Bricolage Grotesque for the wordmark. Caspilot is an autonomous DeFi agent on Casper whose promise is "autonomy you can audit" — the AI proposes, a policy and signer authorize, the chain executes, and the agent never holds keys. The mark must feel like a precision control-room instrument, not crypto hype.

CONCEPT — "the heading dial" (commit to this single idea): a clean geometric open ring shaped like a letter C (gap opening to the right), drawn as an instrument bezel in the text color #ECECEE. A single slim compass needle (a thin lance / narrow diamond — never a filled play-button triangle) pivots from the exact center and points out through the gap. The needle and a small tick at its tip are the ONLY amber (#FF5A1F) elements. The read: a pilot setting a heading, and one single accountable, authorized point. Flat, two-color, no gradients inside the mark.

Deliver these variants, each as its own inline SVG, labeled, on the page:
1. Primary horizontal lockup: glyph + 12px gap + "Caspilot" in Bricolage Grotesque 600, #ECECEE, tracking -0.01em. Then a second lockup variant with the mono tagline "autonomy you can audit" set beneath the wordmark in 11px JetBrains Mono, #9A9AA3.
2. Glyph only, square (viewBox 0 0 48 48), optically centered with even clear-space.
3. Favicon: a simplified glyph that stays legible at 16px — keep the ring + amber tip tick, thin or drop fine needle detail if it muddies.
4. Monochrome: one-color versions — all #ECECEE for the dark canvas, and all #0A0A0B for use on light backgrounds.
5. On-light: the primary lockup on a #FFFFFF card to prove it survives inversion.

SVG / technical requirements:
- Build the glyph from simple primitives (a <path> arc for the ring, a <path> or <polygon> needle) on a pixel-aligned grid with even stroke widths so it is crisp at 16 and 32 px. If any part is stroked, use vector-effect="non-scaling-stroke".
- Use currentColor for the ring so it inherits text color via CSS; expose the accent as a CSS variable --accent: #FF5A1F and color the needle/tick with it, so it recolors in one place.
- Each SVG includes role="img" and a <title>Caspilot</title>.
- Beneath each variant, show its copyable SVG source in a <pre> block.
- Include a clear-space note (clear space = the ring stroke-radius on all sides) and minimum size (glyph 16px).

Anti-slop: no purple; no gradient inside the logo; no hexagon coins, rockets, robot heads, circuit-board lines, "AI" sparkles, or blockchain cubes. No Inter / Roboto / Space Grotesk. Amber appears only in the needle and tip tick. A single soft amber glow behind the glyph is allowed in the page presentation but never inside the SVG itself.

Refine next: the needle angle and length, the ring gap position and width, and the favicon's 16px legibility.
```

*Handoff note:* Open Design will likely render "Caspilot" as live Bricolage Grotesque text, not outlined paths — fine for review, but outline the wordmark for true production use. The ownable IP is the glyph, which the prompt forces to pure vector paths.

---

## 7. Build & iteration order

Ordered to **lock the reusable component system first**: build the component-densest page early so every later page inherits already-settled components. (Alternative — lead with Landing to lock the judge-facing first impression — is equally valid; swap steps 3 and 6 if you prefer that. Either way, **Shell is always first and Developers always last**.)

1. **DESIGN.md first** (section 2) — install it so every artifact is consistent. Not a prompt; it's the design system you select before generating anything.
2. **App Shell (6.0)** — establishes nav, top bar, wallet, and the shared component look every later prompt references by name. Its screenshot anchors the rest.
3. **Intent detail (6.4)** — the demo star *and* the densest page (stepper, trace, proof, gated actions). Settle its components here and the rest of the app inherits them.
4. **Intents list + create (6.3)** — reuses StateBadge / IntentTable / IntentForm; the path into the star.
5. **Console (6.2)** — ties the spine together; cheap to build once 6.3/6.4 exist.
6. **Landing (6.1)** — the judge funnel. Visually independent (its own components) so it can float, but lock it before the demo since it's the first thing judges see.
7. **Vaults (6.5)** then **Vault detail (6.6)** — the second product line.
8. **Developers (6.7)** — supporting surface; can land last.

Per page: generate with the recommended skill → screenshot → refine the flagged regions in comment-mode → only then translate the approved artifact into the real `apps/web` Next.js components (mapping 1:1 to the component library in section 4). Keep the real backend contract authoritative — the prompts mirror it, but `apps/api` is the source of truth for endpoint shapes and FSM states.

---

### Appendix — gap-to-page traceability

| Audit gap (current `apps/web`) | Closed by |
|---|---|
| No navigation / every route an island | App Shell (6.0) + sidebar in all app pages |
| Splash `/` is a dead end | Landing (6.1) with "Launch console" funnel |
| FSM not drivable; `validatePolicy`/`reject` never called | Intent detail (6.4) gated `ActionBar` |
| No list→detail navigation | Intents table rows link to detail (6.3 → 6.4) |
| CSPR.click `wallet.ts` unwired | Vaults `SignFlow` (6.5) |
| No loading / disabled / success / error states | Global model (section 5) applied in every prompt |
| Detail page swallows all errors into empty list | Intent detail NotFound + InlineAlert (6.4) |
| Trace shape drift / no proof surfaced | AuditTraceTimeline + OnchainProofCard (6.4) |
| Paid-agent-API line invisible in UI | Developers page (6.7) |
