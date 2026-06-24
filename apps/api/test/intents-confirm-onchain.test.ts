import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';
import type { DeployReader } from '../src/intents/router.js';

// confirm-onchain is the ONLY path that records a REAL deployHash. It must verify
// finality on-chain itself (deployReader) and commit the reservation only on a
// finalized SUCCESS — never trusting the client-supplied hash. The recorded audit
// event is tagged as a human co-sign (user_cspr_click), distinct from the agent's
// autonomous server signer.
const HASH = 'a'.repeat(64);

const revertReader: DeployReader = {
  async awaitDeployFinalized() {
    return { finalizedHeight: 10, success: false, errorCode: 7 };
  },
};

const notFinalizedReader: DeployReader = {
  async awaitDeployFinalized() {
    throw new Error('deploy_not_finalized');
  },
};

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

function confirm(app: ReturnType<typeof buildApp>, id: string, deployHash: unknown) {
  return app.request(`/intents/${id}/confirm-onchain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deployHash }),
  });
}

describe('POST /intents/:id/confirm-onchain', () => {
  let deps: StubDeps;
  afterEach(() => {
    deps.cleanup();
  });

  it('commits the reservation and records a human co-sign only after on-chain success', async () => {
    deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    const res = await confirm(app, id, HASH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; deployHash: string };
    expect(body.state).toBe('EXECUTED');
    expect(body.deployHash).toBe(HASH);
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('committed');

    // The trace must attribute this execution to the user's wallet co-sign, not
    // the autonomous server signer — honest provenance for the real on-chain tx.
    const trace = (await (await app.request(`/intents/${id}/trace`)).json()) as {
      entries: Array<{ state: string; payload: Record<string, unknown> }>;
    };
    const exec = trace.entries.find((e) => e.state === 'EXECUTED');
    expect(exec?.payload.deployHash).toBe(HASH);
    expect(exec?.payload.signerRole).toBe('user_cspr_click');
  });

  it('records the chain-resolved hashKind so the trace links the correct cspr.live URL', async () => {
    // A native CSPR transfer resolves on-chain as a Casper 2.0 transaction. The
    // verifier reports hashKind:'transaction'; confirm-onchain must persist it in
    // the audit event so the trace (and any later reload) links /transaction/<hash>,
    // not /deploy/<hash>. The kind is chain-resolved, never client-supplied.
    const v1Reader: DeployReader = {
      async awaitDeployFinalized() {
        return { finalizedHeight: 8273600, success: true, hashKind: 'transaction' };
      },
    };
    deps = makeStubDeps({}, { deployReader: v1Reader });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    expect((await confirm(app, id, HASH)).status).toBe(200);

    const trace = (await (await app.request(`/intents/${id}/trace`)).json()) as {
      entries: Array<{ state: string; payload: Record<string, unknown> }>;
    };
    const exec = trace.entries.find((e) => e.state === 'EXECUTED');
    expect(exec?.payload.hashKind).toBe('transaction');
  });

  it('does NOT commit when the deploy reverted on-chain (422)', async () => {
    deps = makeStubDeps({}, { deployReader: revertReader });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    const res = await confirm(app, id, HASH);
    expect(res.status).toBe(422);
    // Reservation stays held, intent stays POLICY_VALIDATED — nothing executed.
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('reserved');
  });

  it('does NOT commit when the deploy never finalized (422)', async () => {
    deps = makeStubDeps({}, { deployReader: notFinalizedReader });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    const res = await confirm(app, id, HASH);
    expect(res.status).toBe(422);
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('reserved');
  });

  it('rejects a malformed deploy hash with 400 (before any on-chain read)', async () => {
    deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    const res = await confirm(app, id, 'too-short');
    expect(res.status).toBe(400);
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('reserved');
  });

  it('requires POLICY_VALIDATED — refuses to confirm an unvalidated intent (409)', async () => {
    deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app); // stays DRAFT
    const res = await confirm(app, id, HASH);
    expect(res.status).toBe(409);
  });

  it('is idempotent — a second confirm returns EXECUTED without re-verifying or re-committing', async () => {
    // Reader succeeds once, then throws: proves the idempotent path short-circuits
    // BEFORE re-reading the chain.
    let calls = 0;
    const onceReader: DeployReader = {
      async awaitDeployFinalized() {
        calls += 1;
        if (calls > 1) throw new Error('must not re-verify on idempotent confirm');
        return { finalizedHeight: 9, success: true };
      },
    };
    deps = makeStubDeps({}, { deployReader: onceReader });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app);
    await validate(app, id);

    expect((await confirm(app, id, HASH)).status).toBe(200);
    const second = await confirm(app, id, HASH);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { state: string }).state).toBe('EXECUTED');
    expect(deps.spendLedger.findByIntentId(id)?.status).toBe('committed');
  });

  it('returns 404 for an unknown intent id', async () => {
    deps = makeStubDeps();
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const res = await confirm(app, 'intent-does-not-exist', HASH);
    expect(res.status).toBe(404);
  });
});
