import { Hono } from 'hono';
import { z } from 'zod';
import { mintIntentId, type IntentState } from '@caspilot/intent-fsm';
import {
  checkPolicyRules,
  computePolicyDigest,
  dayUtcFromMs,
  type SignerGuard,
  type SignerGuardPolicy,
  type SignRequest,
  type SpendLedger,
  type SpendReservation,
} from '@caspilot/signer-guard';
import { PlannerRedactor, type AuditTraceStore } from '@caspilot/audit-trace';
import { buildCep18TransferDeploy, buildNativeTransferDeploy } from '@caspilot/adapters';

// Algorithm-tagged Casper public key hex: 01 + ED25519 (32 bytes) or 02 +
// SECP256K1 (33 bytes). This is the user's wallet key — the deploy account that
// CSPR.click signs and pays from. We validate shape only; on-chain validity is
// the wallet's concern.
const CASPER_PK_RE = /^(?:01[0-9a-fA-F]{64}|02[0-9a-fA-F]{66})$/;

const CreateBody = z.object({
  agent: z.string(),
  receiver: z.string(),
  token: z.string(),
  contract: z.string(),
  network: z.string(),
  amount: z.string(),
});

// Structural view of CasperDeployAdapter.awaitDeployFinalized — kept minimal so
// the API never imports casper-js-sdk at the type level. Live wiring injects the
// real adapter; tests inject a stub.
export interface DeployReader {
  awaitDeployFinalized(deployHash: string): Promise<{
    finalizedHeight: number;
    success: boolean;
    errorCode?: number;
    // Which on-chain variant resolved the hash: a legacy 'deploy' or a Casper 2.0
    // 'transaction' (native CSPR transfers). Optional so presence-only stub readers
    // need not set it; the real adapter always does. Persisted in the audit event so
    // the trace routes the correct cspr.live URL (chain-resolved, never client-said).
    hashKind?: 'deploy' | 'transaction';
  }>;
}

export interface IntentRouterDeps {
  guard: SignerGuard;
  policy: SignerGuardPolicy;
  audit: AuditTraceStore;
  spendLedger: SpendLedger;
  now?: () => number;
  // Present only in live wiring (real RPC keys). Their presence mounts the
  // on-chain co-sign endpoints; pure-demo mode omits them and keeps mark-executed.
  unsignedDeploy?: { chainName: string; paymentMotes: string };
  deployReader?: DeployReader;
}

// Single-signer demo: the spend ledger keys day-cap + replay accounting on a
// fixed placeholder pk, never a real signing key. Actual signing stays behind
// SignerGuard; this id only groups reservations for one logical signer. The
// vault projection reads usage under this same key, so it lives here as the one
// source of truth — if reader and writer drift, usage silently reads zero.
export const SIGNER_PK_PLACEHOLDER = `01${'00'.repeat(32)}`;

export function intentsRouter(deps: IntentRouterDeps): Hono {
  const r = new Hono();
  const now = deps.now ?? (() => Date.now());
  const redactor = new PlannerRedactor();
  const signerPkPlaceholder = SIGNER_PK_PLACEHOLDER;
  const state: Map<
    string,
    {
      state: IntentState;
      body: z.infer<typeof CreateBody>;
      createdAtMs: number;
      updatedAtMs: number;
      // The verified on-chain deploy hash, set once confirm-onchain finalizes.
      // Retained so a repeat confirm is idempotent without re-reading the chain.
      deployHash?: string;
    }
  > = new Map();

  r.post('/', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const body = CreateBody.safeParse(raw);
    if (!body.success) return c.json({ error: 'invalid_body', issues: body.error.format() }, 400);
    const id = mintIntentId();
    const t = now();
    state.set(id, { state: 'DRAFT', body: body.data, createdAtMs: t, updatedAtMs: t });
    deps.audit.append({
      intentId: id,
      state: 'DRAFT',
      atMs: t,
      kind: 'created',
      payload: { body: body.data },
    });
    return c.json({ id, state: 'DRAFT' }, 201);
  });

  r.get('/', (c) => {
    const intents = [...state.entries()]
      .map(([id, e]) => ({
        id,
        state: e.state,
        agent: e.body.agent,
        receiver: e.body.receiver,
        token: e.body.token,
        contract: e.body.contract,
        network: e.body.network,
        amount: e.body.amount,
        updatedAtMs: e.updatedAtMs,
      }))
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return c.json({ intents });
  });

  r.post('/:id/validate-policy', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (entry.state !== 'DRAFT') return c.json({ error: 'invalid_state', state: entry.state }, 409);
    const t = now();
    // Read-only policy gate: checkPolicyRules only reads policy, traceId, and the
    // intended* fields, so signerPk/unsignedDeploy are inert placeholders — this
    // path never signs and never touches a real key.
    const signReq: SignRequest = {
      policy: deps.policy,
      intentId: id,
      traceId: id,
      signerRole: deps.policy.signerRole,
      signerPk: signerPkPlaceholder,
      unsignedDeploy: { headerJson: {}, bodyHashHex: '00'.repeat(32), payloadHex: '' },
      intendedContractPackage: entry.body.contract,
      intendedReceiver: entry.body.receiver,
      intendedToken: entry.body.token,
      intendedAmountAtomic: entry.body.amount,
      intendedChainId: entry.body.network,
    };
    const denial = checkPolicyRules(signReq);
    if (denial) {
      entry.state = 'REJECTED';
      entry.updatedAtMs = t;
      deps.audit.append({
        intentId: id,
        state: 'REJECTED',
        atMs: t,
        kind: 'policy_check',
        payload: { allowed: false, code: denial },
      });
      return c.json({ id, state: 'REJECTED', code: denial }, 422);
    }
    // Reserve the spend now so the day cap is enforced atomically and the intent
    // holds budget through execution. mark-executed commits this reservation;
    // reject releases it.
    const reservation: SpendReservation = {
      signerRole: deps.policy.signerRole,
      signerPk: signerPkPlaceholder,
      token: entry.body.token,
      dayUtc: dayUtcFromMs(t),
      amount: entry.body.amount,
      intentId: id,
      traceId: id,
    };
    const reserved = await deps.spendLedger.reserve(reservation, deps.policy.perDayCapAtomic);
    if (!reserved.ok) {
      entry.state = 'REJECTED';
      entry.updatedAtMs = t;
      deps.audit.append({
        intentId: id,
        state: 'REJECTED',
        atMs: t,
        kind: 'policy_check',
        payload: { allowed: false, code: reserved.reason },
      });
      return c.json({ id, state: 'REJECTED', code: reserved.reason }, 422);
    }
    const policyDigest = computePolicyDigest(deps.policy);
    entry.state = 'POLICY_VALIDATED';
    entry.updatedAtMs = t;
    deps.audit.append({
      intentId: id,
      state: 'POLICY_VALIDATED',
      atMs: t,
      kind: 'policy_check',
      payload: { allowed: true, policyDigest },
    });
    return c.json({ id, state: 'POLICY_VALIDATED', policyDigest });
  });

  r.post('/:id/mark-executed', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    // Phase-4 demo fast-forward: accepting POLICY_VALIDATED here collapses the
    // x402 payment + signing sub-protocol (PAYMENT_REQUIRED..ACCEPTED_BY_NODE)
    // that Phase 5 will drive step-by-step. The canonical @caspilot/intent-fsm
    // deliberately forbids this skip (see ALLOWED_TRANSITIONS / the "rejects
    // skipping" test); the API does not claim FSM conformance for this hop, so
    // the audit trace honestly records the jump instead of fabricating
    // intermediate states that never happened.
    if (entry.state !== 'POLICY_VALIDATED' && entry.state !== 'ACCEPTED_BY_NODE') {
      return c.json({ error: 'invalid_state', state: entry.state }, 409);
    }
    let body: { deployHash?: string };
    try {
      body = (await c.req.json()) as { deployHash?: string };
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    if (!body.deployHash || !/^[0-9a-f]{64}$/.test(body.deployHash)) {
      return c.json({ error: 'invalid_deploy_hash' }, 400);
    }
    const t = now();
    const reservation = deps.spendLedger.findByIntentId(id);
    if (reservation && reservation.status === 'reserved') {
      await deps.spendLedger.commit(reservation.id);
    }
    entry.state = 'EXECUTED';
    entry.updatedAtMs = t;
    deps.audit.append({
      intentId: id,
      state: 'EXECUTED',
      atMs: t,
      kind: 'execution',
      payload: { deployHash: body.deployHash },
    });
    return c.json({ id, state: 'EXECUTED', deployHash: body.deployHash });
  });

  // On-chain co-sign endpoints mount only with live deploy config. Pure-demo mode
  // (no RPC keys) omits deps.unsignedDeploy and relies on mark-executed instead.
  if (deps.unsignedDeploy) {
    const unsignedDeploy = deps.unsignedDeploy;
    // Build an UNSIGNED CEP-18 transfer for the user's own wallet to sign + pay
    // via CSPR.click. No key touches this server: signerPk is the user's PUBLIC
    // key and becomes the deploy account. Pure CPU — no state change, no
    // broadcast; confirm-onchain is what records a verified execution.
    r.post('/:id/build-unsigned-deploy', async (c) => {
      const id = c.req.param('id');
      const entry = state.get(id);
      if (!entry) return c.json({ error: 'not_found' }, 404);
      let body: { signerPk?: unknown };
      try {
        body = (await c.req.json()) as { signerPk?: unknown };
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const signerPk = body.signerPk;
      if (typeof signerPk !== 'string' || !CASPER_PK_RE.test(signerPk)) {
        return c.json({ error: 'invalid_signer_pk' }, 400);
      }
      // Defense-in-depth: independently re-assert policy on the intended params
      // before emitting any deploy bytes, regardless of how the intent got here.
      const denial = checkPolicyRules({
        policy: deps.policy,
        intentId: id,
        traceId: id,
        signerRole: deps.policy.signerRole,
        signerPk,
        unsignedDeploy: { headerJson: {}, bodyHashHex: '00'.repeat(32), payloadHex: '' },
        intendedContractPackage: entry.body.contract,
        intendedReceiver: entry.body.receiver,
        intendedToken: entry.body.token,
        intendedAmountAtomic: entry.body.amount,
        intendedChainId: entry.body.network,
      });
      if (denial) return c.json({ error: 'policy_denied', code: denial }, 422);
      if (entry.state !== 'POLICY_VALIDATED') {
        return c.json({ error: 'invalid_state', state: entry.state }, 409);
      }
      // token 'CSPR' moves native value: emit a `transfer` session paid from the
      // user's own wallet (no CEP-18 balance needed — the path that can actually
      // broadcast on testnet). Any other token is a CEP-18 versioned-package call.
      // The recipient/amount differ by unit: native targets a PublicKey with motes;
      // CEP-18 targets an account-hash Key with token base units.
      //
      // A native transfer needs DISTINCT source/target purses. signerPk == the
      // receiver pubkey ⇒ same purse ⇒ the mint reverts on-chain ("Invalid purse",
      // EqualSourceAndTarget). Refuse here, before emitting deploy bytes, so the
      // wallet never pops and the user never burns gas on a doomed transfer.
      // (buildNativeTransferDeploy enforces the same invariant as a backstop.)
      if (
        entry.body.token === 'CSPR' &&
        signerPk.toLowerCase() === entry.body.receiver.toLowerCase()
      ) {
        return c.json({ error: 'self_transfer_forbidden' }, 422);
      }
      const envelope =
        entry.body.token === 'CSPR'
          ? buildNativeTransferDeploy({
              chainName: unsignedDeploy.chainName,
              senderPk: signerPk,
              paymentMotes: unsignedDeploy.paymentMotes,
              recipient: entry.body.receiver,
              amountMotes: entry.body.amount,
            })
          : buildCep18TransferDeploy({
              chainName: unsignedDeploy.chainName,
              senderPk: signerPk,
              paymentMotes: unsignedDeploy.paymentMotes,
              tokenPackage: entry.body.contract,
              recipient: entry.body.receiver,
              amount: entry.body.amount,
            });
      return c.json({ envelope });
    });
  }

  if (deps.deployReader) {
    const deployReader = deps.deployReader;
    // Confirm a wallet-broadcast deploy by INDEPENDENTLY verifying finality
    // on-chain, then commit the reservation + record the REAL deploy hash. We
    // never trust the client-supplied hash: a node throw (not yet known /
    // transient) OR a revert both block the commit. Only a finalized success
    // executes the intent. This is the demo's first genuinely UI-triggered,
    // on-chain-verified proof.
    r.post('/:id/confirm-onchain', async (c) => {
      const id = c.req.param('id');
      const entry = state.get(id);
      if (!entry) return c.json({ error: 'not_found' }, 404);
      let body: { deployHash?: unknown };
      try {
        body = (await c.req.json()) as { deployHash?: unknown };
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const deployHash = body.deployHash;
      if (typeof deployHash !== 'string' || !/^[0-9a-f]{64}$/.test(deployHash)) {
        return c.json({ error: 'invalid_deploy_hash' }, 400);
      }
      // Idempotent: once executed, re-confirming echoes the recorded result —
      // no second chain read, no double commit.
      if (entry.state === 'EXECUTED') {
        return c.json({
          id,
          state: 'EXECUTED',
          deployHash: entry.deployHash ?? deployHash,
          alreadyConfirmed: true,
        });
      }
      if (entry.state !== 'POLICY_VALIDATED') {
        return c.json({ error: 'invalid_state', state: entry.state }, 409);
      }
      let finalization: {
        finalizedHeight: number;
        success: boolean;
        errorCode?: number;
        hashKind?: 'deploy' | 'transaction';
      };
      try {
        finalization = await deployReader.awaitDeployFinalized(deployHash);
      } catch {
        // Not yet finalized (or the node doesn't know this hash). Honest outcome:
        // unverified ⇒ do not commit, do not execute.
        return c.json({ error: 'deploy_not_finalized' }, 422);
      }
      if (!finalization.success) {
        // A revert is honest provenance, not a server error: the user's tx was
        // mined but failed (e.g. PolicyVault rejection). Surface the code; keep
        // the reservation held and the intent un-executed.
        return c.json({ error: 'execution_reverted', errorCode: finalization.errorCode }, 422);
      }
      const t = now();
      const reservation = deps.spendLedger.findByIntentId(id);
      if (reservation && reservation.status === 'reserved') {
        await deps.spendLedger.commit(reservation.id);
      }
      entry.state = 'EXECUTED';
      entry.deployHash = deployHash;
      entry.updatedAtMs = t;
      // Attribute the execution to the user's wallet co-sign (signed AND paid from
      // their own key via CSPR.click) — NOT the agent's autonomous server signer.
      deps.audit.append({
        intentId: id,
        state: 'EXECUTED',
        atMs: t,
        kind: 'execution',
        payload: {
          deployHash,
          signerRole: 'user_cspr_click',
          approval: 'human_cosign',
          finalizedHeight: finalization.finalizedHeight,
          // Chain-resolved variant ('deploy' | 'transaction') so the trace links
          // the correct cspr.live path. Omitted when the reader didn't report one.
          ...(finalization.hashKind ? { hashKind: finalization.hashKind } : {}),
        },
      });
      return c.json({ id, state: 'EXECUTED', deployHash });
    });
  }

  r.get('/:id/trace', (c) => {
    const id = c.req.param('id');
    if (!state.has(id)) return c.json({ error: 'not_found' }, 404);
    const entries = deps.audit.listByIntent(id).map((row) => {
      // redactWithReport so the row can honestly say WHETHER reasoning/secrets
      // were stripped. The client only ever sees the post-redaction payload, so
      // this flag is the only truthful source for a "redacted" chip.
      const report = redactor.redactWithReport(JSON.parse(row.payload_json) as Record<string, unknown>);
      return {
        atMs: row.at_ms,
        state: row.state,
        kind: row.kind,
        payload: report.value,
        redacted: report.redacted,
      };
    });
    return c.json({ id, entries });
  });

  r.post('/:id/reject', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    const terminal: IntentState[] = ['FINALIZED', 'EXECUTION_FAILED', 'REJECTED', 'TIMEOUT'];
    if (terminal.includes(entry.state)) {
      return c.json({ error: 'already_terminal', state: entry.state }, 409);
    }
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason ?? 'rejected';
    const t = now();
    // Release a still-open reservation so the held budget returns to the day cap.
    // A reservation that was already committed (post-execution) stays committed:
    // release() only flips 'reserved' rows.
    const reservation = deps.spendLedger.findByIntentId(id);
    if (reservation && reservation.status === 'reserved') {
      await deps.spendLedger.release(reservation.id);
    }
    entry.state = 'REJECTED';
    entry.updatedAtMs = t;
    deps.audit.append({
      intentId: id,
      state: 'REJECTED',
      atMs: t,
      kind: 'rejected',
      payload: { reason },
    });
    return c.json({ id, state: 'REJECTED', reason });
  });

  return r;
}
