import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deployAccountFromEnvelope } from '@caspilot/adapters';
import { buildApp } from '../src/server.js';
import { makeStubDeps, type StubDeps } from './_stubs.js';

// Native CSPR path: the value moved IS native CSPR (token 'CSPR'), so the build
// emits a `transfer` session — NOT a CEP-18 versioned call. The recipient is a
// PublicKey hex (the node credits the derived account). The user's wallet signs
// + pays from its own funded testnet balance, so this is the path that can
// actually broadcast without holding any CEP-18 token. Policy still gates
// receiver + amount + chain; token/package are the native sentinels.
//
// We never import casper-js-sdk into the API layer: the non-hex sentinel package
// `native-cspr-transfer` is itself the proof the native branch ran — the CEP-18
// builder's bareHash would throw on it, so a 200 with a valid envelope can only
// come from the native builder.
const USER_PK = `01${'ab'.repeat(32)}`;
// A real ED25519 recipient pubkey (01 + 32 bytes). Native transfers target a
// PublicKey, not an account-hash.
const RECIPIENT_PK = `01${'cd'.repeat(32)}`;

// Motes-denominated caps: native amounts are in motes, so the single-payment cap
// must clear the casper-test 2.5 CSPR (2_500_000_000 motes) minimum.
const NATIVE_POLICY = {
  allowedTokens: ['CSPR'],
  allowedContractPackages: ['native-cspr-transfer'],
  allowedReceivers: [RECIPIENT_PK],
  maxSinglePaymentAtomic: '5000000000',
  perDayCapAtomic: '50000000000',
};

async function create(app: ReturnType<typeof buildApp>, override: Record<string, string> = {}) {
  const res = await app.request('/intents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: '00' + 'aa'.repeat(32),
      receiver: RECIPIENT_PK,
      token: 'CSPR',
      contract: 'native-cspr-transfer',
      network: 'casper:casper-test',
      amount: '2500000000',
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

describe('POST /intents/:id/build-unsigned-deploy (native CSPR)', () => {
  let deps: StubDeps;
  beforeEach(() => {
    deps = makeStubDeps(NATIVE_POLICY);
  });
  afterEach(() => {
    deps.cleanup();
  });

  it('builds an unsigned native transfer whose deploy account is the user pubkey (user pays)', async () => {
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
    // Keyless recovery from the envelope agrees with the pubkey we asked to build
    // for — the wallet will sign + pay as this same account.
    expect(deployAccountFromEnvelope(body.envelope)).toBe(USER_PK);
  });

  it('rejects building before policy validation (must be POLICY_VALIDATED)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    const { id } = await create(app); // stays DRAFT
    const res = await build(app, id, USER_PK);
    expect(res.status).toBe(409);
  });

  it('re-validates policy independently and refuses an over-cap native transfer (422)', async () => {
    const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps });
    // 6_000_000_000 motes > single-payment cap 5_000_000_000. The build endpoint
    // re-checks policy itself, so it refuses even a (here DRAFT) intent outright.
    const { id } = await create(app, { amount: '6000000000' });
    const res = await build(app, id, USER_PK);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe('amount_above_single_cap');
  });

  it('refuses a self-transfer (signerPk === receiver) with 422 before the wallet signs', async () => {
    // Receiver == the signing wallet ⇒ source purse == target purse ⇒ the mint
    // reverts on-chain ("Invalid purse", EqualSourceAndTarget). Catch it here,
    // BEFORE emitting any deploy bytes, so the user never pops the wallet or burns
    // gas on a transfer that can never succeed. Needs a policy that allowlists the
    // signer as a receiver, otherwise the generic receiver check would mask it.
    const selfDeps = makeStubDeps({ ...NATIVE_POLICY, allowedReceivers: [USER_PK] });
    try {
      const app = buildApp({ env: { expectedChainspec: 'casper-test' }, deps: selfDeps });
      const { id } = await create(app, { receiver: USER_PK });
      await validate(app, id);
      const res = await build(app, id, USER_PK);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe('self_transfer_forbidden');
    } finally {
      selfDeps.cleanup();
    }
  });
});
