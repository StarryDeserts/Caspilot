import { Hono } from 'hono';
import { z } from 'zod';
import { mintIntentId, type IntentState } from '@caspilot/intent-fsm';
import type { SignerGuard } from '@caspilot/signer-guard';
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
  // exposed for next task
  (r as unknown as { _state: typeof state })._state = state;
  return r;
}
