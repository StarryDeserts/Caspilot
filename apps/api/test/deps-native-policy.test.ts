import { describe, it, expect, afterEach } from 'vitest';
import { deployAccountFromEnvelope } from '@caspilot/adapters';
import { buildApp } from '../src/server.js';
import { buildApiDeps, nativeDemoPolicy, NATIVE_SENTINEL_PACKAGE, type ApiDeps } from '../src/deps.js';
import type { DeployReader } from '../src/intents/router.js';

// The live browser co-sign demo moves NATIVE CSPR: the user's wallet already
// holds testnet CSPR (no CEP-18 balance needed), so this is the path that can
// actually broadcast. Its policy is MOTES-denominated and allowlists a PublicKey
// receiver the operator supplies — separate from the CEP-18 DEFAULT_DEMO_POLICY
// because the amount cap is unit-blind and cannot serve both unit systems.
const fakeDeployReader: DeployReader = {
  async awaitDeployFinalized() {
    return { finalizedHeight: 1, success: true };
  },
};

const USER_PK = `01${'ab'.repeat(32)}`;
const RECEIVER_PK = `01${'cd'.repeat(32)}`;
const OTHER_PK = `01${'ef'.repeat(32)}`;

function nativeIntent(receiver: string) {
  return {
    agent: `00${'aa'.repeat(32)}`,
    receiver,
    token: 'CSPR',
    contract: NATIVE_SENTINEL_PACKAGE,
    network: 'casper:casper-test',
    amount: '2500000000', // 2.5 CSPR in motes — the casper-test transfer minimum
  };
}

async function create(app: ReturnType<typeof buildApp>, receiver: string): Promise<string> {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(nativeIntent(receiver)),
  });
  return ((await res.json()) as { id: string }).id;
}

describe('nativeDemoPolicy (live CSPR.click native co-sign wiring)', () => {
  let deps: ApiDeps | undefined;
  afterEach(() => {
    deps?.cleanup();
    deps = undefined;
  });

  it('lets a native CSPR intent to the allowlisted receiver pass validate-policy', async () => {
    deps = buildApiDeps({
      policy: nativeDemoPolicy(RECEIVER_PK),
      deployReader: fakeDeployReader,
      unsignedDeploy: { chainName: 'casper-test', paymentMotes: '3000000000' },
    });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await create(app, RECEIVER_PK);
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe('POLICY_VALIDATED');
  });

  it('builds an unsigned NATIVE transfer (non-hex sentinel proves the native branch ran)', async () => {
    deps = buildApiDeps({
      policy: nativeDemoPolicy(RECEIVER_PK),
      deployReader: fakeDeployReader,
      unsignedDeploy: { chainName: 'casper-test', paymentMotes: '3000000000' },
    });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await create(app, RECEIVER_PK);
    await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    const res = await app.request(`/intents/${id}/build-unsigned-deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signerPk: USER_PK }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { envelope: { headerJson: unknown } };
    expect(typeof body.envelope.headerJson).toBe('object');
    // CEP-18's bareHash would throw on the non-hex sentinel — a valid envelope
    // whose account is the user pubkey can only come from the native builder.
    expect(deployAccountFromEnvelope(body.envelope as never)).toBe(USER_PK);
  });

  it('rejects a native intent to a non-allowlisted receiver (allowlist is real)', async () => {
    deps = buildApiDeps({
      policy: nativeDemoPolicy(RECEIVER_PK),
      deployReader: fakeDeployReader,
      unsignedDeploy: { chainName: 'casper-test', paymentMotes: '3000000000' },
    });
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const id = await create(app, OTHER_PK);
    const res = await app.request(`/intents/${id}/validate-policy`, { method: 'POST' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { state: string }).state).toBe('REJECTED');
  });
});
