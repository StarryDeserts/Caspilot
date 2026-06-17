import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

describe('GET /intents/:id/trace', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('redacts forbidden keys from the exported trace', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const create = await app.request('/intents', {
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
    const { id } = (await create.json()) as { id: string };
    deps.audit.append({
      intentId: id,
      state: 'DRAFT',
      atMs: 1_700_000_000_001,
      kind: 'created',
      payload: { prompt: 'leak', privateKey: 'leak', constraints: { maxAmount: '500' } },
    });
    const res = await app.request(`/intents/${id}/trace`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('leak');
    expect(text).toContain('maxAmount');
  });

  it('marks every demo row redacted:false (nothing is ever hidden on the happy path)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const create = await app.request('/intents', {
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
    const { id } = (await create.json()) as { id: string };
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });

    const res = await app.request(`/intents/${id}/trace`);
    const body = (await res.json()) as { entries: Array<{ kind: string; redacted: boolean }> };
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
    for (const e of body.entries) expect(e.redacted).toBe(false);
  });

  it('marks a row redacted:true only when the raw payload actually carried a forbidden key', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const create = await app.request('/intents', {
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
    const { id } = (await create.json()) as { id: string };
    deps.audit.append({
      intentId: id,
      state: 'POLICY_VALIDATED',
      atMs: 1_700_000_000_002,
      kind: 'policy_check',
      payload: { allowed: true, reasoning: 'hidden chain of thought' },
    });

    const res = await app.request(`/intents/${id}/trace`);
    const body = (await res.json()) as {
      entries: Array<{ kind: string; redacted: boolean; payload: Record<string, unknown> }>;
    };
    const created = body.entries.find((e) => e.kind === 'created');
    const secret = body.entries.find((e) => e.kind === 'policy_check');
    expect(created?.redacted).toBe(false);
    expect(secret?.redacted).toBe(true);
    expect(secret?.payload).not.toHaveProperty('reasoning');
    expect(secret?.payload).toMatchObject({ allowed: true });
  });
});
