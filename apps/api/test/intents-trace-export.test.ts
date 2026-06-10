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
});
