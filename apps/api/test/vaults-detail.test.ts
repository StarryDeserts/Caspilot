import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';
import { vaultId } from '../src/vaults/projection.js';

type App = ReturnType<typeof buildApp>;

async function createIntent(app: App, amount: string): Promise<string> {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: `00${'aa'.repeat(32)}`,
      receiver: `00${'bb'.repeat(32)}`,
      token: 'cspr-test-cep18',
      contract: `00${'cc'.repeat(32)}`,
      network: 'casper:casper-test',
      amount,
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

async function reserve(app: App, amount: string): Promise<string> {
  const id = await createIntent(app, amount);
  await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
  return id;
}

describe('GET /vaults/:id', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('returns vault detail with recent debits (reserved+committed; released excluded)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    // committed 500
    const committed = await reserve(app, '500');
    await app.request(`/intents/${committed}/mark-executed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deployHash: 'a'.repeat(64) }),
    });
    // reserved 300
    await reserve(app, '300');
    // reserved 100 then rejected → released (excluded from usage + debits)
    const released = await reserve(app, '100');
    await app.request(`/intents/${released}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    });

    const res = await app.request(`/vaults/${vaultId(deps.policy)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      usedTodayAtomic: string;
      requireTraceId: boolean;
      allowedChainIds: string[];
      recentDebits: Array<{ amount: string; status: string; intentId: string }>;
    };
    expect(body.id).toBe(vaultId(deps.policy));
    expect(body.usedTodayAtomic).toBe('800');
    expect(body.requireTraceId).toBe(false);
    expect(body.allowedChainIds).toEqual(['casper:casper-test']);
    // Two debits (released 100 excluded). createdAt can tie under a real clock,
    // so compare as a set keyed by amount; #6's unit test pins newest-first order.
    const byAmount = [...body.recentDebits].sort((a, b) => Number(a.amount) - Number(b.amount));
    expect(byAmount.map((d) => `${d.amount}:${d.status}`)).toEqual(['300:reserved', '500:committed']);
  });

  it('returns 404 for an unknown vault id', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await app.request('/vaults/vault_doesnotexist');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });
});
