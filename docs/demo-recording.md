# Caspilot — Demo-Video Recording Runbook

A line-by-line shooting script for the hackathon demo. Target length **2–3 minutes**.

**The spine is now the live UI co-sign** — a human signs and pays a *real* casper-test transaction, triggered from our own console, and the backend independently verifies it on-chain before recording it. The on-chain **policy rejections** (on the block explorer) are the supporting thesis act behind it. Two distinct demonstrations, one message: **a signature is necessary, but never sufficient.**

> 🔐 **On-camera safety:** never show or print the contents of `Test Account 1_secret_key.pem`. Keep it out of frame, don't `cat` it, blur any path autocomplete. Throwaway testnet key — treat it like a real one on screen. The CSPR.click app id (`csprclick-template`), the plain RPC URL, and public keys are *not* secrets; the `.pem` is.

> 👆 **The one step you must film in a real browser.** Act 1's wallet popup (Casper Wallet via CSPR.click) cannot be auto-recorded. The headless recorder, jsdom, SSR, and WSL2 cannot drive a wallet extension — in headless the **Sign & submit** button correctly renders *disabled* (no wallet connected). Record Act 1 live with OBS in real Chrome/Brave with the extension installed and a funded account. Everything else can be screen-captured normally.

---

## Before you hit record

### Servers + live mode

```bash
# API in native + live-co-sign mode (prints "live on-chain co-sign enabled" on boot)
CASPILOT_NODE_RPC_URL=https://node.testnet.casper.network/rpc \
CASPILOT_NATIVE_RECEIVER=<a DIFFERENT account you control> \
CASPILOT_DB_PATH=:memory: PORT=8787 pnpm --filter caspilot-api dev   # → :8787

pnpm --filter caspilot-web dev                                        # → :3001
```

- **Funded wallet:** the signing account needs testnet CSPR for **gas + the transfer amount**. Keep the default amount tiny.
- **Two distinct accounts in one wallet.** Casper forbids a self-transfer (`sender == receiver` → "Invalid purse" / `EqualSourceAndTarget`); the backend also rejects it at build time (`422 self_transfer_forbidden`). Set `CASPILOT_NATIVE_RECEIVER` to a *second* account you hold.
- **Native CSPR, by design.** The live co-sign moves native CSPR, not CEP-18 — the demo CEP-18 package isn't installed on-chain (`-32008 no such package`). The CEP-18 path is the *separately-sealed Tier-1 vault proof* (Act 2), not this one. Don't conflate them on camera.

### Clean stage

1. **Clean workspace.** Close noisy panels; terminal font ≥ 16pt; browser zoom up for legibility.
2. **Pre-open explorer tabs** (so you're not typing URLs on camera):
   - Vault contract — <https://testnet.cspr.live/contract/8f75ba257f61ae1bbfa1f974a617705e519757445a77189d7c011327bdc5d63e>
   - `pay()` **accepted** — <https://testnet.cspr.live/deploy/a7419aa2fcedff56b76fe509ecc745b9f1da0ecd5b26e0205a0241061242bdf5>
   - `pay()` **rejected — receiver** — <https://testnet.cspr.live/deploy/e6801a750b58bbe955240b0fef19e53ced76219be397043bb1f56e03280bcec7>
   - `pay()` **rejected — over max** — <https://testnet.cspr.live/deploy/c4a48997dfcd7c56c2d019caaa771467f71d48d50ca85584218fb2a9327a0eea>
3. **Warm the tests** off-camera so the green summary is instant: `pnpm install && pnpm -r test`.
4. **Recording tool:** OBS Studio at **1080p**. Narrate live or add voiceover in post.

---

## The script (≈ 2:45, line by line)

Timecodes are cumulative targets. **Say** lines are the exact 台词 — read them as voiceover; each sentence is one beat.

### Act 0 — The problem (0:00 – 0:18)

**Screen:** the `/` landing page (or the README headline).

**Say:**
> "An AI agent that manages money needs a key — and a key is unbounded authority."
> "If the model is wrong, jailbroken, or just hallucinates a recipient, nothing normally stops it."
> "Caspilot's answer: the agent only *proposes*. A human and the chain *authorize*. Let me show you — live."

---

### Act 1 — The live co-sign · THE SPINE (0:18 – 1:28)

> 🎥 Film this whole act live in a real browser. This is the part judges haven't seen elsewhere.

**1a — Create + validate (0:18 – 0:38)**

**Screen:** `/intents` → fill the intent form → **Create intent** (`DRAFT` badge + id) → validate → `POLICY_VALIDATED`.

**Say:**
> "This is the console. I'll create a payment intent — a real transfer on Casper testnet."
> "The agent drafts it. No key, no funds moved yet."
> "Policy validation runs, and the intent reaches POLICY_VALIDATED — approved off-chain, but nothing is signed."

**1b — Sign & submit → wallet popup (0:38 – 1:05)**

**Screen:** `/intents/<id>` detail → click **Sign & submit on testnet (wallet)** → 👆 **Casper Wallet popup** appears.
**Action:** review the transaction in the wallet, then **Approve**.

**Say:**
> "Now the differentiator. I click *Sign and submit*."
> "This pops my own browser wallet, through CSPR.click."
> "I'm the human in the loop — I review the transaction, and I approve it, paying from *my* account, not the agent's."
> "The agent never held the key to do this on its own."

**1c — Independent on-chain verify → EXECUTED → proof (1:05 – 1:28)**

**Screen:** the trace advances `SIGNED → … → EXECUTED`; the proof block shows the **real** deployHash; click **View on testnet.cspr.live**.

**Say:**
> "CSPR.click broadcasts it. Now watch the backend."
> "It does *not* trust my word that it worked — it independently polls the chain for finality."
> "Only once the network confirms does it record EXECUTED. There's the real transaction hash, tagged *human co-sign*."
> "One click opens it on the public explorer — finalized, verifiable, and triggered from this UI."

> ⚠️ **Click only the real co-sign intent's hash.** Seeded demo intents that show `EXECUTED` carry *synthetic* hashes for UI legibility — never click "View on testnet" for those on camera. Record a *fresh* intent you just co-signed (its hash resolves), or fall back to the prior sealed run below.
>
> **Fallback if you can't film the popup:** show the already-sealed real co-sign on the explorer — tx [`299d1288…fe7543`](https://testnet.cspr.live/transaction/299d1288e7edfed64e1de6ca9d229834b02f2de22d75999b59a09b5403fe7543) (`signerRole: user_cspr_click`, `approval: human_cosign`) — and narrate 1a–1c over the static UI. Say plainly you're showing a run you recorded earlier; don't imply the popup is happening now.

---

### Act 2 — The thesis: on-chain rejections (1:28 – 2:05)

**Screen:** the pre-opened **rejected (receiver)** then **rejected (over max)** explorer tabs.

**Say:**
> "But a human won't be in the loop for *every* payment. So the agent's autonomous path has an on-chain backstop — the PolicyVault."
> "Here's the same agent, correctly signed, paying a receiver that's not on the allowlist. The vault reverts — User error 3, ReceiverNotAllowed."
> "And here, trying to exceed the per-payment cap — reverted again. User error 4, AmountAboveMax."
> "Two valid signatures. Both stopped on-chain, purely for breaking policy. A signature is necessary — but never sufficient."

> The per-payment cap and daily cap shown are config values chosen for legibility; the reserve/commit ledger enforcing them is real.

---

### Act 3 — Trust model + tests (2:05 – 2:35)

**Screen:** cut to the terminal; show the warmed `pnpm -r test` green summary. Optionally glance at the redacted audit trace.

**Say:**
> "Under the hood, the agent never holds a key — it hands off a detached signature, and a separate adapter broadcasts."
> "Off-chain, a deny-by-default SignerGuard reserves budget before anything is signed."
> "Every decision is written to a redacted audit trace — what was decided, never the prompt or the model's reasoning."
> "Four hundred and twenty-eight tests cover the whole path."

---

### Act 4 — Close (2:35 – 2:48)

**Screen:** the repo URL + the value-proposition trust diagram (`docs/value-proposition.md`).

**Say:**
> "AI proposes; a human and the vault authorize; the chain executes."
> "That's Caspilot — agent autonomy you can actually bound."
> "The code and every on-chain proof are in the repo."

---

## Honesty guardrails (read before publishing)

- **Two separate proofs, one thesis.** Act 1 (native-CSPR human co-sign, UI-triggered, backend-verified) and Act 2 (CEP-18 PolicyVault on-chain enforcement) are *distinct* demonstrations. Don't say or imply the Act 1 transfer passed through the vault.
- **Only real hashes get clicked.** The live co-sign hash and the four Tier-1 deploy hashes resolve on cspr.live. Seeded `EXECUTED` demo intents do not — keep them off the explorer.
- **The popup is live or it's labeled.** Either film the real wallet approval, or explicitly narrate the fallback as a prior recorded run.
- **Stepper honesty.** After a native/fast-forward co-sign, the intermediate FSM states (`PAYMENT_REQUIRED … ACCEPTED_BY_NODE`) stay grey by design — don't claim those were individually hit.
- **No secrets on screen.** No `cat` of the `.pem`; double-check the final render for any `.env` or key-path reveal.

---

## Post-production & publishing

- **Captions/lower-thirds** for the two error codes (`User error: 3 → ReceiverNotAllowed`, `User error: 4 → AmountAboveMax`) and for the **real deployHash** in Act 1 — they're the punchlines; make them legible.
- **Trim dead air** around the wallet approval (the popup round-trip) and the `pnpm test` run.
- Export 1080p, upload (YouTube unlisted / Loom), then **paste the link into the README** under "Demo video" and into the hackathon submission.
- Final-render check for any accidental PEM/`.env` reveal.

## Pre-flight checklist

- [ ] API booted in **native + live-co-sign** mode (saw "live on-chain co-sign enabled"); `web dev` + `api dev` up; `POST /intents` returns `201`.
- [ ] Real browser (Chrome/Brave) with **Casper Wallet** installed, on `casper-test`, **funded** (gas + amount), with a **second** receiver account set in `CASPILOT_NATIVE_RECEIVER`.
- [ ] A fresh intent created live and walked to `POLICY_VALIDATED` so **Sign & submit** is enabled.
- [ ] Explorer tabs pre-opened (vault contract + accepted + 2 rejections).
- [ ] `pnpm -r test` warmed and green (428).
- [ ] Key file out of frame; no `cat`/print of secrets; app id / RPC / public keys are fine to show.
- [ ] Narration matches what's on screen; the popup is filmed live (or the fallback is labeled).
- [ ] Terminal/browser fonts legible at 1080p.
