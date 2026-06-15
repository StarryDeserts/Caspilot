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

const CreateBody = z.object({
  agent: z.string(),
  receiver: z.string(),
  token: z.string(),
  contract: z.string(),
  network: z.string(),
  amount: z.string(),
});

export interface IntentRouterDeps {
  guard: SignerGuard;
  policy: SignerGuardPolicy;
  audit: AuditTraceStore;
  spendLedger: SpendLedger;
  now?: () => number;
}

export function intentsRouter(deps: IntentRouterDeps): Hono {
  const r = new Hono();
  const now = deps.now ?? (() => Date.now());
  const redactor = new PlannerRedactor();
  // Single-signer demo: the spend ledger keys day-cap + replay accounting on a
  // fixed placeholder pk, never a real signing key. Actual signing stays behind
  // SignerGuard; this id only groups reservations for one logical signer.
  const signerPkPlaceholder = `01${'00'.repeat(32)}`;
  const state: Map<
    string,
    { state: IntentState; body: z.infer<typeof CreateBody>; createdAtMs: number }
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
    state.set(id, { state: 'DRAFT', body: body.data, createdAtMs: t });
    deps.audit.append({
      intentId: id,
      state: 'DRAFT',
      atMs: t,
      kind: 'created',
      payload: { body: body.data },
    });
    return c.json({ id, state: 'DRAFT' }, 201);
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
    deps.audit.append({
      intentId: id,
      state: 'EXECUTED',
      atMs: t,
      kind: 'execution',
      payload: { deployHash: body.deployHash },
    });
    return c.json({ id, state: 'EXECUTED', deployHash: body.deployHash });
  });

  r.get('/:id/trace', (c) => {
    const id = c.req.param('id');
    if (!state.has(id)) return c.json({ error: 'not_found' }, 404);
    const entries = deps.audit.listByIntent(id).map((row) => ({
      atMs: row.at_ms,
      state: row.state,
      kind: row.kind,
      payload: redactor.redact(JSON.parse(row.payload_json) as Record<string, unknown>),
    }));
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
