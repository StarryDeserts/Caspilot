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

async function commitSpend(app: App, amount: string): Promise<void> {
  const id = await reserve(app, amount);
  await app.request(`/intents/${id}/mark-executed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deployHash: 'a'.repeat(64) }),
  });
}

describe('GET /vaults', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('returns the one live vault with today usage summed reserved+committed', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    await commitSpend(app, '500'); // committed 500
    await reserve(app, '300'); // reserved 300

    const res = await app.request('/vaults');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vaults: Array<{
        id: string;
        usedTodayAtomic: string;
        perDayCapAtomic: string;
        token: string;
      }>;
    };
    expect(body.vaults).toHaveLength(1);
    expect(body.vaults[0]?.id).toBe(vaultId(deps.policy));
    expect(body.vaults[0]?.usedTodayAtomic).toBe('800');
    expect(body.vaults[0]?.perDayCapAtomic).toBe('100000');
    expect(body.vaults[0]?.token).toBe('cspr-test-cep18');
  });

  it('reports zero usage when nothing has been reserved', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await app.request('/vaults');
    const body = (await res.json()) as { vaults: Array<{ usedTodayAtomic: string }> };
    expect(body.vaults[0]?.usedTodayAtomic).toBe('0');
  });
});
