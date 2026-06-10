import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

async function create(app: ReturnType<typeof buildApp>, override: Record<string, unknown> = {}) {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: '00' + 'aa'.repeat(32),
      receiver: '00' + 'bb'.repeat(32),
      token: 'cspr-test-cep18',
      contract: '00' + 'cc'.repeat(32),
      network: 'casper:casper-test',
      amount: '500',
      ...override,
    }),
  });
  return (await res.json()) as { id: string; state: string };
}

describe('POST /intents/:id/validate-policy', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('moves to POLICY_VALIDATED when guard allows', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; policyDigest: string };
    expect(body.state).toBe('POLICY_VALIDATED');
    expect(body.policyDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('moves to REJECTED with reason when guard denies (amount above max)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app, { amount: '600' });
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { state: string; code: string };
    expect(body.state).toBe('REJECTED');
    expect(body.code).toBe('amount_above_single_cap');
  });

  it('returns 409 when the intent is no longer in DRAFT', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    const first = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(first.status).toBe(200);
    const second = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; state: string };
    expect(body.error).toBe('invalid_state');
    expect(body.state).toBe('POLICY_VALIDATED');
  });
});
