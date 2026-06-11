import { describe, it, expect, vi } from 'vitest';
import { CLValue, Deploy, KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import { buildContractCallDeploy } from '../src/deploy-builder.js';
import { CasperDeployAdapter } from '../src/casper-deploy.js';

const FIXED_TS = 1_700_000_000_000;
const RPC_URL = 'http://node:7777/rpc';

// validate() returns false for a wrong signature, but may also throw on a
// malformed/mismatched approval — treat either as "not valid".
function validates(deploy: Deploy): boolean {
  try {
    return deploy.validate();
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Mints a fresh key, builds an offline envelope, and detaches a real tagged
// signature over the deploy hash — exactly the bytes a RawSigner would hand back.
function signedFixture(amount = 1000) {
  const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
  const signerPk = sk.publicKey.toHex(false);
  const env = buildContractCallDeploy({
    chainName: 'casper-test',
    senderPk: signerPk,
    contractHash: 'a'.repeat(64),
    entryPoint: 'transfer',
    args: { amount: CLValue.newCLUInt512(amount) },
    paymentMotes: '3000000000',
    timestampMs: FIXED_TS,
  });
  const tagged = sk.signAndAddAlgorithmBytes(Buffer.from(env.bodyHashHex, 'hex'));
  return { env, signerPk, signatureHex: Buffer.from(tagged).toString('hex') };
}

type Envelope = ReturnType<typeof buildContractCallDeploy>;

// An offline envelope only — the observe path never signs.
function envFixture(amount = 1000): Envelope {
  const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
  return buildContractCallDeploy({
    chainName: 'casper-test',
    senderPk: sk.publicKey.toHex(false),
    contractHash: 'a'.repeat(64),
    entryPoint: 'transfer',
    args: { amount: CLValue.newCLUInt512(amount) },
    paymentMotes: '3000000000',
    timestampMs: FIXED_TS,
  });
}

// A Casper 2.0 (Condor) info_get_deploy result with execution_info present.
// A null error_message is a successful execution; a "User error: <code>"
// string is a revert carrying the contract's numeric code.
function finalizedDeploy(env: Envelope, opts: { height: number; errorMessage?: string }): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    result: {
      api_version: '2.0.0',
      deploy: env.headerJson,
      execution_info: {
        block_hash: 'b'.repeat(64),
        block_height: opts.height,
        execution_result: {
          Version2: {
            initiator: { AccountHash: 'account-hash-' + 'c'.repeat(64) },
            error_message: opts.errorMessage ?? null,
            limit: '1',
            consumed: '1',
            refund: '0',
            current_price: 1,
            cost: '1',
            transfers: [],
            size_estimate: 1,
            effects: [],
          },
        },
      },
    },
  });
}

// The node has accepted the deploy but not yet executed it.
function pendingDeploy(env: Envelope): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    result: { api_version: '2.0.0', deploy: env.headerJson, execution_info: null },
  });
}

// The node does not yet know this deploy (propagation window): a JSON-RPC error.
function unknownDeploy(): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    error: { code: -32000, message: 'No such deploy' },
  });
}

describe('CasperDeployAdapter.submitSignedDeploy', () => {
  it('reattaches the signature and broadcasts a deploy that validates over its own hash', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ jsonrpc: '2.0', id: 1, result: { deploy_hash: env.bodyHashHex } }),
      );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const { deployHash } = await adapter.submitSignedDeploy({
      envelope: env,
      signatureHex,
      signerPk,
    });

    // We return the locally-recomputed hash, not the node's echo.
    expect(deployHash).toBe(env.bodyHashHex);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The crux: offline-verify exactly what went over the wire. The broadcast
    // deploy must carry one approval whose signature is valid over its own hash.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RPC_URL);
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.method).toBe('account_put_deploy');
    const broadcast = Deploy.fromJSON(sent.params.deploy);
    expect(validates(broadcast)).toBe(true);
    expect(broadcast.approvals).toHaveLength(1);
    expect(broadcast.hash.toHex()).toBe(env.bodyHashHex);
    expect(broadcast.approvals[0]?.signature.toHex()).toBe(signatureHex);
  });

  it('rejects a tampered signature before any network call', async () => {
    const { env, signerPk } = signedFixture();
    const fetchMock = vi.fn();
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.submitSignedDeploy({
        envelope: env,
        signatureHex: '01' + 'f'.repeat(128),
        signerPk,
      }),
    ).rejects.toThrow('deploy_validation_failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an envelope whose bodyHashHex disagrees with the rebuilt deploy', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi.fn();
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.submitSignedDeploy({
        envelope: { ...env, bodyHashHex: 'b'.repeat(64) },
        signatureHex,
        signerPk,
      }),
    ).rejects.toThrow('deploy_hash_mismatch');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an http error as http_<status>', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.submitSignedDeploy({ envelope: env, signatureHex, signerPk }),
    ).rejects.toThrow('http_500');
  });

  it('surfaces a JSON-RPC error as rpc_<code>', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid' } }),
      );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.submitSignedDeploy({ envelope: env, signatureHex, signerPk }),
    ).rejects.toThrow('rpc_-32602');
  });
});

describe('CasperDeployAdapter.awaitDeployFinalized', () => {
  const NOOP_SLEEP = async () => {};

  it('returns the finalized height for a successful execution', async () => {
    const env = envFixture();
    const fetchMock = vi.fn().mockResolvedValue(finalizedDeploy(env, { height: 4242 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // Success carries no errorCode at all (not an undefined key).
    expect(out).toEqual({ finalizedHeight: 4242, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // It asked info_get_deploy for exactly this hash.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RPC_URL);
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.method).toBe('info_get_deploy');
    expect(sent.params.deploy_hash).toBe(env.bodyHashHex);
  });

  it('reports success=false and the numeric error code for a reverted execution', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(finalizedDeploy(env, { height: 77, errorMessage: 'User error: 60004' }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    expect(out).toEqual({ finalizedHeight: 77, success: false, errorCode: 60004 });
  });

  it('polls past a pending (accepted-but-not-executed) deploy until it finalizes', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pendingDeploy(env))
      .mockResolvedValueOnce(finalizedDeploy(env, { height: 9000 }));
    const sleep = vi.fn(async () => {});
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, {
      sleep,
      pollIntervalMs: 1234,
    });

    expect(out).toEqual({ finalizedHeight: 9000, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it('retries through the propagation window where the node does not yet know the deploy', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unknownDeploy())
      .mockResolvedValueOnce(finalizedDeploy(env, { height: 5 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    expect(out).toEqual({ finalizedHeight: 5, success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws deploy_not_finalized after exhausting the attempt budget', async () => {
    const env = envFixture();
    const fetchMock = vi.fn().mockImplementation(() => pendingDeploy(env));
    const sleep = vi.fn(async () => {});
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.awaitDeployFinalized(env.bodyHashHex, { sleep, maxAttempts: 3 }),
    ).rejects.toThrow('deploy_not_finalized');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Sleeps between attempts only — never after the final one.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('CasperDeployAdapter.healthCheck', () => {
  it('confirms write-path liveness via a read-only info_get_status (never a broadcast)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { api_version: '2.0.0' } }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.healthCheck();

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The crux: a health check must probe, never put a deploy on chain.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RPC_URL);
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.method).toBe('info_get_status');
    expect(sent.method).not.toBe('account_put_deploy');
  });

  it('reports not-ok with the http reason when the node is unreachable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    expect(await adapter.healthCheck()).toEqual({ ok: false, reason: 'http_503' });
  });

  it('reports not-ok with the rpc reason when the node returns an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'method not found' },
        }),
      );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    expect(await adapter.healthCheck()).toEqual({ ok: false, reason: 'rpc_-32601' });
  });
});
