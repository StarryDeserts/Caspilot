import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { buildApiDeps, type ApiDeps } from '../src/deps.js';
import type { DeployReader } from '../src/intents/router.js';

// A keyless on-chain verifier stand-in: reports a finalized, successful deploy.
// Live wiring injects the real CasperDeployAdapter; here we only need the
// presence of a reader to prove the co-sign endpoints get mounted.
const fakeDeployReader: DeployReader = {
  async awaitDeployFinalized() {
    return { finalizedHeight: 1, success: true };
  },
};

const USER_PK = `01${'ab'.repeat(32)}`;

async function toPolicyValidated(app: ReturnType<typeof buildApp>): Promise<string> {
  const id = await createDemoIntent(app);
  await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
  return id;
}

const DEMO_INTENT = {
  agent: `00${'aa'.repeat(32)}`,
  receiver: `00${'bb'.repeat(32)}`,
  token: 'cspr-test-cep18',
  contract: `00${'cc'.repeat(32)}`,
  network: 'casper:casper-test',
  amount: '500',
};

async function createDemoIntent(app: ReturnType<typeof buildApp>): Promise<string> {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(DEMO_INTENT),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe('buildApiDeps (production dependency assembly)', () => {
  let deps: ApiDeps | undefined;
  afterEach(() => {
    deps?.cleanup();
    deps = undefined;
  });

  it('assembles deps that mount POST /intents (the routes index.ts must serve)', async () => {
    deps = buildApiDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await app.request('/intents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DEMO_INTENT),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; state: string };
    expect(body.id).toMatch(/^int_/);
    expect(body.state).toBe('DRAFT');
  });

  it('default demo policy lets the canonical demo intent pass validate-policy', async () => {
    deps = buildApiDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await createDemoIntent(app);
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; policyDigest: string };
    expect(body.state).toBe('POLICY_VALIDATED');
    expect(typeof body.policyDigest).toBe('string');
    expect(body.policyDigest.length).toBeGreaterThan(0);
  });

  it('records a redacted trace retrievable over GET /intents/:id/trace', async () => {
    deps = buildApiDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await createDemoIntent(app);
    const res = await app.request(`/intents/${id}/trace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ kind: string }> };
    expect(body.entries.map((e) => e.kind)).toContain('created');
  });

  it('forwards live deploy config so the on-chain co-sign endpoints mount', async () => {
    deps = buildApiDeps({
      deployReader: fakeDeployReader,
      unsignedDeploy: { chainName: 'casper-test', paymentMotes: '3000000000' },
    });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await toPolicyValidated(app);
    const res = await app.request(`/intents/${id}/build-unsigned-deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signerPk: USER_PK }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { envelope?: { headerJson?: unknown } };
    expect(typeof body.envelope?.headerJson).toBe('object');
  });

  it('omits live deploy config by default — pure-demo mode leaves the endpoints unmounted', async () => {
    deps = buildApiDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await toPolicyValidated(app);
    const res = await app.request(`/intents/${id}/build-unsigned-deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signerPk: USER_PK }),
    });
    expect(res.status).toBe(404);
  });
});
