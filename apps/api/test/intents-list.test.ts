import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

function createBody(over: Record<string, string> = {}) {
  return {
    agent: `00${'aa'.repeat(32)}`,
    receiver: `00${'bb'.repeat(32)}`,
    token: 'cspr-test-cep18',
    contract: `00${'cc'.repeat(32)}`,
    network: 'casper:casper-test',
    amount: '500',
    ...over,
  };
}

async function post(app: ReturnType<typeof buildApp>, path: string, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('GET /intents', () => {
  let deps: StubDeps;
  afterEach(() => deps.cleanup());

  it('returns an empty list when no intents exist', async () => {
    deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await app.request('/intents');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ intents: [] });
  });

  it('lists created intents newest-first with summary fields', async () => {
    let clock = 1000;
    deps = { ...makeStubDeps(), now: () => clock };
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });

    clock = 1000;
    const a = (await (await post(app, '/intents', createBody({ amount: '100' }))).json()) as {
      id: string;
    };
    clock = 2000;
    const b = (await (await post(app, '/intents', createBody({ amount: '200' }))).json()) as {
      id: string;
    };

    const res = await app.request('/intents');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { intents: Array<Record<string, unknown>> };
    expect(body.intents).toHaveLength(2);
    expect(body.intents[0]?.id).toBe(b.id);
    expect(body.intents[1]?.id).toBe(a.id);
    expect(body.intents[0]).toMatchObject({
      id: b.id,
      state: 'DRAFT',
      agent: `00${'aa'.repeat(32)}`,
      receiver: `00${'bb'.repeat(32)}`,
      token: 'cspr-test-cep18',
      contract: `00${'cc'.repeat(32)}`,
      network: 'casper:casper-test',
      amount: '200',
      updatedAtMs: 2000,
    });
  });

  it('reflects the latest state and updatedAtMs after a transition', async () => {
    let clock = 1000;
    deps = { ...makeStubDeps(), now: () => clock };
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });

    clock = 1000;
    const a = (await (await post(app, '/intents', createBody())).json()) as { id: string };
    clock = 5000;
    await post(app, `/intents/${a.id}/validate-policy`);

    const res = await app.request('/intents');
    const body = (await res.json()) as { intents: Array<Record<string, unknown>> };
    expect(body.intents[0]).toMatchObject({
      id: a.id,
      state: 'POLICY_VALIDATED',
      updatedAtMs: 5000,
    });
  });
});
