import { Hono } from 'hono';
import { z } from 'zod';
import { mintIntentId, type IntentState } from '@caspilot/intent-fsm';
import {
  checkPolicyRules,
  computePolicyDigest,
  type SignerGuard,
  type SignerGuardPolicy,
  type SignRequest,
} from '@caspilot/signer-guard';
import type { AuditTraceStore } from '@caspilot/audit-trace';

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
  now?: () => number;
}

export function intentsRouter(deps: IntentRouterDeps): Hono {
  const r = new Hono();
  const now = deps.now ?? (() => Date.now());
  const state: Map<string, { state: IntentState; body: z.infer<typeof CreateBody>; createdAtMs: number }> = new Map();

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
    deps.audit.append({ intentId: id, state: 'DRAFT', atMs: t, kind: 'created', payload: { body: body.data } });
    return c.json({ id, state: 'DRAFT' }, 201);
  });

  r.post('/:id/validate-policy', async (c) => {
    const id = c.req.param('id');
    const entry = state.get(id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (entry.state !== 'DRAFT') return c.json({ error: 'invalid_state', state: entry.state }, 409);
    const t = now();
    const req: SignRequest = {
      policy: deps.policy,
      intentId: id,
      traceId: id,
      signerRole: deps.policy.signerRole,
      signerPk: `01${'00'.repeat(32)}`,
      unsignedDeploy: { headerJson: {}, bodyHashHex: '00'.repeat(32), payloadHex: '' },
      intendedContractPackage: entry.body.contract,
      intendedReceiver: entry.body.receiver,
      intendedToken: entry.body.token,
      intendedAmountAtomic: entry.body.amount,
      intendedChainId: entry.body.network,
    };
    const denial = checkPolicyRules(req);
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

  return r;
}
