# Caspilot — Live Demo Runbook (UI-triggered on-chain co-sign)

The headline capability: a human clicks **Sign & submit** in the web console, the
**Casper Wallet** pops, the user **signs and pays** a real `casper-test` transfer,
CSPR.click broadcasts it, and the backend **independently verifies finality on-chain**
(`info_get_deploy`) before recording it as `EXECUTED`. The resulting `deployHash` is a
**real, explorer-verifiable** transaction — not a seeded placeholder.

> One thesis sentence: *"The AI proposes a payment; a human co-signs and pays from their
> own wallet; the chain is the backstop — and every step is on an auditable trace."*

This runbook is the **operator's script** for showing that live. For the granular,
input-by-input click-path (and the native-vs-CEP-18 nuance), see the companion
[`manual-test-native-cspr.zh.md`](manual-test-native-cspr.zh.md). For the
explorer-only, zero-UI proof track, see [`demo-recording.md`](demo-recording.md) (Track A)
and [`tier1-demo.md`](tier1-demo.md).

---

## The single user-driven step (read this first)

Everything in this flow is automatable **except one step**: the **Casper Wallet
signature popup**. It requires a real browser with the extension on `casper-test`, a
funded sender account, and a human click. It **cannot** be driven from headless
chromium / jsdom / SSR / CI (confirmed on WSL2). Plan the demo around that:

```
create ──▶ validate-policy ──▶ [👆 SIGN & SUBMIT — wallet popup, human approves] ──▶ confirm-onchain ──▶ EXECUTED
   automatable      automatable          ⬆ THE ONE LIVE STEP                       automatable (backend)
```

If you cannot get the wallet to cooperate live (travel, locked-down machine, flaky
extension), fall back to the **Already-real proof** section below — there is a genuine,
already-finalized co-sign transaction you can open on the explorer without signing
anything on camera.

---

## Pre-flight

1. **Servers up** (local is fine):
   - Web console → <http://localhost:3001/intents>  (`/` is the marketing page; the
     wallet button lives on `/intents`)
   - API → <http://localhost:8787/healthz> returns `{"ok":true}`
2. **API must be in native + live-co-sign mode**, started with the **receiver's** public
   key (a *different* account than your signer — native CSPR cannot self-transfer). The
   startup log line that confirms it:
   ```
   caspilot-api listening on :8787 (live on-chain co-sign enabled)
   ```
   Exact command + the self-transfer guard explanation: see
   [`manual-test-native-cspr.zh.md` §2](manual-test-native-cspr.zh.md).
3. **Wallet funded**: signer account holds ≥ ~5 test-CSPR (2.5 to transfer + gas) from
   <https://testnet.cspr.live/tools/faucet>. Receiver is a **second account in the same
   wallet** (no real loss; both purses are yours).
4. **On-camera safety**: never show `*_secret_key.pem`. The browser-wallet path never
   exposes a key, but keep terminals clean of any PEM path.

---

## Live click-path (what to do + what to say)

| # | Action (UI) | Resulting state | Narration |
|---|---|---|---|
| 1 | Open `/intents`, click **Connect CSPR.click** → pick **Casper Wallet** → approve | — | *"The console connects to the user's own wallet — the backend never sees a key."* |
| 2 | **New intent** → set **Transfer type = Native CSPR** → fill Agent (`00`+64 hex), Receiver (the **second account's** public key), Amount `2500000000` → **Create intent** | `DRAFT` | *"The agent drafts a payment intent. No key, no funds moved."* |
| 3 | On the detail page, **Actions** → **Validate policy** | `POLICY_VALIDATED` | *"An off-chain deny-by-default policy reserves budget and checks receiver/token/amount/chain — before anything is signed."* |
| 4 | **Sign & submit on testnet (wallet)** → status shows `Building unsigned transfer…` then `Awaiting wallet signature…` | (in flight) | *"The backend builds an unsigned transfer **with the user's public key as the paying account**."* |
| 5 | **👆 THE LIVE STEP** — approve in the **Casper Wallet popup** (confirm: native transfer, 2.5 CSPR, receiver ≠ signer) | (broadcasting) | *"The human co-signs and pays. This popup is the consent gate — nothing broadcasts without it."* |
| 6 | Status → `Broadcast <hash>… — verifying on-chain…` then `Verified on-chain — intent executed.` | `EXECUTED` | *"CSPR.click broadcasts; the backend independently polls `info_get_deploy` and only records EXECUTED on verified finality — it never trusts a client-supplied hash."* |
| 7 | **On-chain proof** panel shows `✓ VERIFIED`, the real hash, and **View on testnet.cspr.live ↗** | — | *"Real, explorer-verifiable proof, triggered from the UI."* Click the link. |

The stepper render is **honest**: on the co-sign fast-forward, the skipped per-payment
sub-states (`PAYMENT_REQUIRED … ACCEPTED_BY_NODE`) stay **grey** — they are not painted
green, because they never happened. `DRAFT → POLICY_VALIDATED` is green; `EXECUTED` is the
orange current node.

---

## Already-real proof (fallback / the link for the submission)

This co-sign transaction is **already finalized on-chain** — open it any time, no signing
required. Use it if the live popup won't cooperate, or paste it straight into the
hackathon submission:

- **Intent:** `int_1djd80m90egcdaio4gs5j9bukr` (`EXECUTED`, `signerRole: user_cspr_click`,
  `approval: human_cosign`)
- **Transaction (TransactionV1):**
  `299d1288e7edfed64e1de6ca9d229834b02f2de22d75999b59a09b5403fe7543`
- **Explorer:**
  <https://testnet.cspr.live/transaction/299d1288e7edfed64e1de6ca9d229834b02f2de22d75999b59a09b5403fe7543>

> Note the URL kind is **`/transaction/`**, not `/deploy/` — this is a Casper 2.0
> `TransactionV1`. The backend records `hashKind: transaction` and the UI links the
> matching explorer path automatically; never hand-edit it to `/deploy/`.

A second already-real co-sign intent exists for redundancy: `int_4rnvloovn6b7m8712v62ghn74l`.

The separately-sealed **Tier-1** explorer proofs (accepted `pay()` + two policy
rejections) are independent on-chain evidence and live in
[`tier1-demo.md`](tier1-demo.md) — they need nothing hosted and make a strong cold open.

---

## Honesty guardrails (do not cross these on camera)

- **Seeded `EXECUTED` intents carry synthetic deployHashes.** The demo seed
  (`apps/api/scripts/seed-web-demo.ts`, token `cspr-test-cep18`) uses `mark-executed`
  with **placeholder** hashes. **Do not** click "View on testnet.cspr.live" for those and
  call it real proof. The only real, UI-triggered proof is the co-sign intents above
  (token `CSPR`, amount `2500000000`).
- **"Mark executed (demo)"** + the `Deploy hash (64-hex) · demo fallback` input is a
  **demo fast-forward**, not a broadcast. It produces no on-chain transaction. Never
  present its hash as real evidence.
- **The vault day-cap** shown in the UI is a demo-legibility config; the usage figures are
  real reserve+commit ledger rows. No production code is altered to make the demo legible.
- **Do not claim the live popup works from harness/SSR/headless green alone.** It is
  user-verified in a real browser; say so.

---

## Captured reference screens

For deck/thumbnail use, headless captures of the three key screens were taken from the
live app (intents list; the `POLICY_VALIDATED` detail with the gated **Sign & submit**
button; the `EXECUTED` detail with `✓ VERIFIED` + real hash). Re-capture with the bundled
chromium if needed:

```bash
CHROME=$(ls ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | head -1)
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1440,2400 --virtual-time-budget=12000 \
  --screenshot=out.png "http://localhost:3001/intents/int_1djd80m90egcdaio4gs5j9bukr"
```

(In headless there is no wallet extension, so the **Sign & submit** button renders
correctly **disabled** with *"Connect a CSPR.click wallet to co-sign this transfer."* —
that is the expected gated state, not a bug.)

---

## Pre-flight checklist

- [ ] API started in **native + live-co-sign** mode (log shows *"live on-chain co-sign
      enabled"*), with `CASPILOT_NATIVE_RECEIVER` = the **second** account's public key.
- [ ] Web dev on :3001; `/healthz` ok on :8787.
- [ ] Wallet on `casper-test`, signer funded ≥ ~5 CSPR, receiver = a distinct 2nd account.
- [ ] Receiver field in the drawer matches `CASPILOT_NATIVE_RECEIVER` **exactly**.
- [ ] Already-real proof link open in a tab as the fallback.
- [ ] No PEM path visible in any terminal.
