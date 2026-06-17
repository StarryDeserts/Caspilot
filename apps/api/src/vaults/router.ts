import { Hono } from 'hono';
import type { IntentRouterDeps } from '../intents/router.js';
import { projectVault, projectVaultDetail, vaultId } from './projection.js';

// Read-only projection of the one live policy + ledger. Reuses IntentRouterDeps
// so the vault reads usage under the exact (policy, spendLedger) the intent
// router writes to — no separate state, no fabricated vaults.
export function vaultsRouter(deps: IntentRouterDeps): Hono {
  const r = new Hono();
  const now = deps.now ?? (() => Date.now());

  r.get('/', (c) => {
    return c.json({ vaults: [projectVault(deps.policy, deps.spendLedger, now())] });
  });

  r.get('/:id', (c) => {
    if (c.req.param('id') !== vaultId(deps.policy)) return c.json({ error: 'not_found' }, 404);
    return c.json(projectVaultDetail(deps.policy, deps.spendLedger, now()));
  });

  return r;
}
