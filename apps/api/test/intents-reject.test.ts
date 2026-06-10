import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

async function create(app: ReturnType<typeof buildApp>) {
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
    }),
  });
  return (await res.json()) as { id: string };
}

describe('POST /intents/:id/reject', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('releases any open reservation and marks REJECTED', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    const res = await app.request(`/intents/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'demo_cancel' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe('REJECTED');
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('released');
  });

  it('keeps a committed reservation committed when rejected after execution', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    await app.request(`/intents/${id}/mark-executed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deployHash: 'a'.repeat(64) }),
    });
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('committed');
    const res = await app.request(`/intents/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'late_cancel' }),
    });
    expect(res.status).toBe(200);
    // release() only flips 'reserved' rows, so an already-committed spend is preserved.
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('committed');
  });

  it('rejects a DRAFT intent that has no reservation without error', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    const res = await app.request(`/intents/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'user_abort' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe('REJECTED');
    expect(deps.spendLedger.findByIntentId(id)).toBe(null);
  });
});
