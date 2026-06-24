import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deployAccountFromEnvelope } from '@caspilot/adapters';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

// The deploy account IS the user's wallet pubkey — CSPR.click signs and pays
// from it. A real ED25519 pubkey is algorithm-tagged: 01 + 64 hex. We re-derive
// the account from the returned envelope (keyless) and assert it round-trips, so
// the test never imports casper-js-sdk into the API layer.
const USER_PK = `01${'ab'.repeat(32)}`;

async function create(app: ReturnType<typeof buildApp>, override: Record<string, string> = {}) {
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
  return (await res.json()) as { id: string };
}

async function validate(app: ReturnType<typeof buildApp>, id: string) {
  await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
}

function build(app: ReturnType<typeof buildApp>, id: string, signerPk: unknown) {
  return app.request(`/intents/${id}/build-unsigned-deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signerPk }),
  });
}

describe('POST /intents/:id/build-unsigned-deploy', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps();
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('builds an unsigned CEP-18 transfer whose deploy account is the user pubkey (user pays)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    const res = await build(app, id, USER_PK);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      envelope: { headerJson: unknown; bodyHashHex: string; payloadHex: string };
    };
    expect(typeof body.envelope.headerJson).toBe('object');
    expect(body.envelope.bodyHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(body.envelope.payloadHex).toMatch(/^[0-9a-f]{64}$/);
    // The signer that the wallet will use is the deploy account — keyless recovery
    // from the envelope must agree with the pubkey we asked to build for.
    expect(deployAccountFromEnvelope(body.envelope)).toBe(USER_PK);
  });

  it('does not mutate intent state — building is pure CPU, not execution', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);
    // Two builds in a row both succeed: no reservation is consumed, no transition.
    expect((await build(app, id, USER_PK)).status).toBe(200);
    expect((await build(app, id, USER_PK)).status).toBe(200);
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('reserved');
  });

  it('rejects building before policy validation (must be POLICY_VALIDATED)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app); // stays DRAFT
    const res = await build(app, id, USER_PK);
    expect(res.status).toBe(409);
  });

  it('re-validates policy independently and refuses to build an over-cap transfer (422)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    // amount 600 > single-payment cap 500. Defense-in-depth: the build endpoint
    // re-checks policy itself, so it refuses even a (here DRAFT) intent outright.
    const { id } = await create(app, { amount: '600' });
    const res = await build(app, id, USER_PK);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe('amount_above_single_cap');
  });

  it('rejects a malformed signer pubkey with 400', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);
    const res = await build(app, id, 'not-a-casper-pubkey');
    expect(res.status).toBe(400);
  });

  it('rejects a missing signer pubkey with 400', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);
    const res = await app.request(`/intents/${id}/build-unsigned-deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown intent id', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await build(app, 'intent-does-not-exist', USER_PK);
    expect(res.status).toBe(404);
  });
});
