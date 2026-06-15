# Caspilot — Demo-Video Recording Runbook

A step-by-step operational flow for recording the hackathon demo. Target length **2–3 minutes**. The guiding principle: **lead with the on-chain proof** — it's the part judges can verify, and it needs nothing hosted.

There are two tracks:

- **Track A — On-chain proof + tests.** Works **today, zero code changes**. This is the mandatory, verifiable core. If you record nothing else, record this.
- **Track B — Live web UI.** Optional polish. Requires the API's intent routes to be enabled (one wiring change — see [`deploy-vercel.md`](deploy-vercel.md#enabling-the-live-api)) and the API running (locally is fine).

> 🔐 **On-camera safety:** never show or print the contents of `Test Account 1_secret_key.pem`. Keep it out of frame, don't `cat` it, and blur the terminal if a path autocomplete reveals more than the filename. It's a throwaway testnet key, but treat it like a real one on screen.

---

## Before you hit record

1. **Clean workspace.** `git status` clean; close noisy editor panels; bump terminal font size (≥ 16pt) and browser zoom for legibility.
2. **Pre-open browser tabs** (so you're not typing URLs on camera):
   - The vault contract: <https://testnet.cspr.live/contract/8f75ba257f61ae1bbfa1f974a617705e519757445a77189d7c011327bdc5d63e>
   - Accepted `pay()`: <https://testnet.cspr.live/deploy/a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5>
   - Rejected (receiver): <https://testnet.cspr.live/deploy/e6801a750b58bbe955240b0fef19e53ced76219be397043bb1f56e03280bcec7>
   - Rejected (over max): <https://testnet.cspr.live/deploy/c4a48997dfcd7c56c2d019caaa771467f71d48d50ca85584218fb2a9327a0eea>
   - [`docs/tier1-demo.md`](tier1-demo.md) rendered (the proof table).
3. **Warm the test command** once off-camera so dependencies are built and the run is fast:
   ```bash
   pnpm install && pnpm test
   ```
4. **Recording tool:** OBS Studio (free) or your OS screen recorder at **1080p**. Record system audio off; narrate live or add voiceover in post.

---

## Track A — On-chain proof + tests (zero code change)

### Shot 1 — The hook (0:00–0:20)

**Screen:** the README headline / proof table.
**Say:** *"Caspilot is an autonomous DeFi agent for Casper that physically cannot run away with your money. The AI proposes payments — but an on-chain PolicyVault has the final say. And I can prove it on a block explorer, right now."*

### Shot 2 — The accepted payment (0:20–0:45)

**Screen:** the **accepted `pay()`** explorer tab.
**Say:** *"Here's the agent paying an allowlisted receiver, within its limits. The vault executes a real CEP-18 transfer — 50 tokens. This is the happy path, finalized on casper-test."*
Point out: the deploy succeeded, the transfer event.

### Shot 3 — The rejections (the thesis) (0:45–1:25)

**Screen:** the **rejected (receiver)** tab.
**Say:** *"Now the same agent, correctly signed, tries to pay a receiver that is NOT on the allowlist. The vault reverts — `User error: 3`, ReceiverNotAllowed — before moving a single token."*

**Screen:** the **rejected (over max)** tab.
**Say:** *"And here it tries to exceed the per-payment cap. Reverted again — `User error: 4`, AmountAboveMax. A valid signature is necessary, but it is never sufficient. The chain is the backstop."*

> These two reverts ARE the policy-enforcement demo. You don't need a UI to show rejection — the explorer is the proof.

### Shot 4 — The trust model + tests (1:25–2:00)

**Screen:** split or cut to the terminal; run the suite live (or show the warmed result):
```bash
pnpm test
```
**Say:** *"Under the hood: the agent never holds a key. It hands off a detached signature; a separate adapter re-validates and broadcasts. Off-chain a deny-by-default SignerGuard reserves budget before anything is signed. 428 tests cover the whole path — FSM, x402 payments, replay protection, redaction."*

**Optional Shot 4b — real broadcast (advanced):** if you want to show a *fresh* on-chain run, narrate the gated live runner (casper-test only, spends test-CSPR). Command and env are in [`tier1-demo.md`](tier1-demo.md#reproduce-it-live-optional). Keep the key file out of frame.

### Shot 5 — Close (2:00–2:20)

**Say:** *"AI proposes; signer and vault authorize; chain executes. That's Caspilot — agent autonomy you can actually bound."*
**Screen:** README repo URL + the proof doc.

---

## Track B — Live web UI (optional)

Adds an interactive layer between Shot 3 and Shot 4. **Prerequisite:** enable the API intent routes (one change in `apps/api/src/index.ts`, see [`deploy-vercel.md`](deploy-vercel.md#enabling-the-live-api)). Then:

### Setup (off-camera)

```bash
pnpm --filter api dev     # terminal 1 → http://localhost:8787
pnpm --filter web dev     # terminal 2 → http://localhost:3001
```

Confirm `curl -s localhost:8787/intents -X POST -H 'content-type: application/json' -d '{...}'` returns `201` before recording. If the web build needs the API base, it defaults to `http://localhost:8787`, so no env is required locally.

### Web shot list

1. **`/` landing** — *"Two product lines over one backend: an x402-paid agent API, and the delegated PolicyVault."* (~5s)
2. **`/intents`** — fill the **Intent** form. All address fields are account hashes in `00<64-hex>` form; amount is a decimal string. Click **Create intent** → a `DRAFT` badge + intent id appears. *"The agent drafts an intent — no key, no funds moved yet."* (~20s)
3. **`/intents/<id>`** — open the detail page; the **audit trace** polls every 2 seconds. *"This is an audit trace, not the model's chain-of-thought — reasoning and prompts are redacted before they're ever persisted, and again on export."* Point at the redacted payloads. (~20s)
4. **`/vaults`** — fill the **PolicyVault** form; click **Create** to draft the deploy payload (shown as JSON). *"Drafting a vault deploy. The user signs this with CSPR.click — the backend never sees a private key."* (~15s)

> Honest scope note: `validate-policy` and `reject` exist in the API and the API client, but are exercised by the test suite rather than wired to buttons in these pages. Keep the UI narration to **create → trace → draft vault**, and let the **explorer** (Track A) carry the accept/reject story. Don't click buttons that aren't there on camera.

---

## Recommended final cut (≈ 2.5 min)

```
0:00  Hook (README proof table)
0:20  Accepted pay() on cspr.live
0:45  Rejected ×2 on cspr.live   ← the thesis
1:15  [Track B] web: create intent → audit trace → draft vault   (optional, ~45s)
1:25/2:00  Trust model + pnpm test (428 green)
2:20  Close + repo link
```

If you're tight on time or haven't wired the API, **drop Track B** — Track A alone is a complete, verifiable demo.

---

## Post-production & publishing

- **Captions/lower-thirds** for the two error codes (`User error: 3 → ReceiverNotAllowed`, `User error: 4 → AmountAboveMax`) — they're the punchline; make them legible.
- **Trim dead air** around the `pnpm test` run (or pre-warm and show the green summary).
- Export 1080p, upload (YouTube unlisted / Loom), then **paste the link into the README** under "Demo video" and into the hackathon submission.
- Double-check the final render for any accidental reveal of the PEM file path/contents or a `.env`.

## Pre-flight checklist

- [ ] Explorer tabs pre-opened; README proof table rendered.
- [ ] `pnpm test` warmed and green.
- [ ] (Track B) API routes wired + `api dev` and `web dev` running; `201` on `POST /intents` confirmed.
- [ ] Key file (`*_secret_key.pem`) out of frame; no `cat`/print of secrets.
- [ ] Terminal/browser font sizes legible at 1080p.
- [ ] Narration matches what's on screen (no claiming UI buttons that aren't wired).
