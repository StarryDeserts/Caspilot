import { describe, it, expect, vi } from 'vitest';
import { CLValue, Deploy, KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import { buildContractCallDeploy, buildNativeTransferDeploy } from '../src/deploy-builder.js';
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

// A Casper 2.0 (Condor) info_get_transaction result with execution_info present.
// On Condor a legacy deploy is wrapped as a transaction, so the deploy rides
// under `transaction.Deploy` and only info_get_transaction surfaces execution
// info — info_get_deploy returns execution_info:null. A null error_message is a
// successful execution; a "User error: <code>" string is a revert carrying the
// contract's numeric code.
function finalizedDeploy(env: Envelope, opts: { height: number; errorMessage?: string }): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    result: {
      api_version: '2.0.0',
      transaction: { Deploy: env.headerJson },
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
    result: { api_version: '2.0.0', transaction: { Deploy: env.headerJson }, execution_info: null },
  });
}

// The transient window observed on Condor: the deploy is in a block (execution_info
// carries a block_height) but the execution_result has not yet been attached. This
// must NOT be read as a successful execution — block inclusion is not a result.
function includedNoResultDeploy(env: Envelope, height: number): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    result: {
      api_version: '2.0.0',
      transaction: { Deploy: env.headerJson },
      execution_info: {
        block_hash: 'b'.repeat(64),
        block_height: height,
        execution_result: null,
      },
    },
  });
}

// The node does not yet know this deploy (propagation window): a JSON-RPC error.
// info_get_transaction reports an unknown deploy as NoSuchTransaction (-32014).
function unknownDeploy(): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    error: { code: -32014, message: 'No such transaction' },
  });
}

type NativeEnvelope = ReturnType<typeof buildNativeTransferDeploy>;

// An offline Casper 2.0 native CSPR transfer envelope (a TransactionV1, not a
// legacy Deploy). Its bodyHashHex IS the transaction hash the node indexes it by.
function nativeEnvFixture(amount = '2500000000'): NativeEnvelope {
  const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
  const recipient = PrivateKey.generate(KeyAlgorithm.ED25519).publicKey.toHex(false);
  return buildNativeTransferDeploy({
    chainName: 'casper-test',
    senderPk: sk.publicKey.toHex(false),
    paymentMotes: '100000000',
    recipient,
    amountMotes: amount,
    timestampMs: FIXED_TS,
  });
}

// A finalized native TransactionV1 result. A 2.0 transaction rides under
// `transaction.Version1` (a legacy deploy rode under `.Deploy`) and is
// addressable ONLY by its transaction hash. A null error_message is a success;
// "Invalid purse" is the Condor revert the legacy native-transfer path hit.
function finalizedNativeV1(
  env: NativeEnvelope,
  opts: { height: number; errorMessage?: string },
): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: '1',
    result: {
      api_version: '2.0.0',
      transaction: { Version1: env.headerJson },
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

// Routes info_get_transaction by the transaction-hash variant the adapter asks
// for. A native V1 is NoSuchTransaction under the Deploy variant (the Deploy-first
// probe throws) and resolves only under Version1 — exactly what the live node does.
function byVariant(handlers: { deploy: () => Response; version1: () => Response }) {
  return (_url: string, init: RequestInit) => {
    const sent = JSON.parse(init.body as string);
    const th = sent.params?.transaction_hash ?? {};
    return 'Version1' in th ? handlers.version1() : handlers.deploy();
  };
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

  it('surfaces a JSON-RPC error as rpc_<code> carrying the node message', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid' } }),
      );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    // The node's human-readable reason must reach the caller — a bare code like
    // -32008 is undiagnosable without it.
    await expect(
      adapter.submitSignedDeploy({ envelope: env, signatureHex, signerPk }),
    ).rejects.toThrow('rpc_-32602: invalid');
  });
});

describe('CasperDeployAdapter.awaitDeployFinalized', () => {
  const NOOP_SLEEP = async () => {};

  it('returns the finalized height for a successful execution', async () => {
    const env = envFixture();
    const fetchMock = vi.fn().mockResolvedValue(finalizedDeploy(env, { height: 4242 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // Success carries no errorCode at all (not an undefined key). Resolved via
    // the Deploy-first probe, so the recorded provenance is a legacy deploy.
    expect(out).toEqual({ finalizedHeight: 4242, success: true, hashKind: 'deploy' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // It observed via info_get_transaction (the Condor path for legacy deploys),
    // addressing the deploy by its hash under the Deploy transaction variant.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RPC_URL);
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.method).toBe('info_get_transaction');
    expect(sent.params.transaction_hash.Deploy).toBe(env.bodyHashHex);
  });

  it('reports success=false and the numeric error code for a reverted execution', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(finalizedDeploy(env, { height: 77, errorMessage: 'User error: 60004' }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    expect(out).toEqual({
      finalizedHeight: 77,
      success: false,
      errorCode: 60004,
      hashKind: 'deploy',
    });
  });

  it('does not mislabel an incidental number in a non-User-error revert as a code', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        finalizedDeploy(env, { height: 88, errorMessage: 'Out of gas after 3 ticks' }),
      );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // Reverted, but the code is unknown — an absent errorCode is more honest
    // than a false one scraped from an unrelated number.
    expect(out).toEqual({ finalizedHeight: 88, success: false, hashKind: 'deploy' });
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

    expect(out).toEqual({ finalizedHeight: 9000, success: true, hashKind: 'deploy' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it('retries through the propagation window where the node does not yet know the deploy', async () => {
    const env = envFixture();
    // Propagation: the deploy 404s on the first probe, then lands as a deploy.
    // The V1 fallback 404s throughout (this is a legacy deploy, never a
    // transaction), so the result must arrive via the deploy probe — and the
    // resolved provenance is therefore honestly 'deploy', not 'transaction'.
    const deploy = vi
      .fn()
      .mockReturnValueOnce(unknownDeploy())
      .mockReturnValue(finalizedDeploy(env, { height: 5 }));
    const fetchMock = vi
      .fn()
      .mockImplementation(byVariant({ deploy: () => deploy(), version1: () => unknownDeploy() }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    expect(out).toEqual({ finalizedHeight: 5, success: true, hashKind: 'deploy' });
    // attempt 0: deploy(unknown→throws) → version1(unknown); attempt 1: deploy(finalized).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not read block inclusion without an execution result as finalized', async () => {
    const env = envFixture();
    const fetchMock = vi
      .fn()
      // In a block (height carried) but the result is not yet attached — must poll on.
      .mockResolvedValueOnce(includedNoResultDeploy(env, 6001))
      .mockResolvedValueOnce(finalizedDeploy(env, { height: 6002 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // It reports the height where the result actually landed, not the bare inclusion.
    expect(out).toEqual({ finalizedHeight: 6002, success: true, hashKind: 'deploy' });
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

  it('finalizes a native TransactionV1 addressed by its transaction hash (the Casper 2.0 path)', async () => {
    const env = nativeEnvFixture();
    const fetchMock = vi.fn().mockImplementation(
      byVariant({
        deploy: () => unknownDeploy(),
        version1: () => finalizedNativeV1(env, { height: 8273600 }),
      }),
    );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    expect(out).toEqual({ finalizedHeight: 8273600, success: true, hashKind: 'transaction' });
    // The crux: it probes the Deploy variant FIRST (the legacy/Tier-1 path stays
    // untouched), then falls back to the Version1 transaction-hash lookup only
    // after that 404s — never the other way around.
    const variants = fetchMock.mock.calls.map(
      ([, init]) =>
        Object.keys(JSON.parse((init as RequestInit).body as string).params.transaction_hash)[0],
    );
    expect(variants).toEqual(['Deploy', 'Version1']);
  });

  it('reports an "Invalid purse" native revert as success:false with no scraped code', async () => {
    const env = nativeEnvFixture();
    const fetchMock = vi.fn().mockImplementation(
      byVariant({
        deploy: () => unknownDeploy(),
        version1: () => finalizedNativeV1(env, { height: 8273600, errorMessage: 'Invalid purse' }),
      }),
    );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // A reverted native transfer must verify as a NON-success so confirm-onchain
    // refuses to commit — and "Invalid purse" carries no "User error: N", so no
    // false numeric code is attached (honest "reverted, code unknown").
    expect(out).toEqual({ finalizedHeight: 8273600, success: false, hashKind: 'transaction' });
  });

  it('reports hashKind "deploy" when the legacy Deploy variant resolves the hash', async () => {
    const env = envFixture();
    const fetchMock = vi.fn().mockResolvedValue(finalizedDeploy(env, { height: 4242 }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // The verifier resolved the hash via the Deploy-first probe, so the recorded
    // provenance is a legacy deploy and confirm-onchain routes cspr.live /deploy/.
    expect(out.hashKind).toBe('deploy');
  });

  it('reports hashKind "transaction" when the native TransactionV1 variant resolves the hash', async () => {
    const env = nativeEnvFixture();
    const fetchMock = vi.fn().mockImplementation(
      byVariant({
        deploy: () => unknownDeploy(),
        version1: () => finalizedNativeV1(env, { height: 8273600 }),
      }),
    );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const out = await adapter.awaitDeployFinalized(env.bodyHashHex, { sleep: NOOP_SLEEP });

    // Resolved only via the Version1 transaction-hash fallback ⇒ Casper 2.0
    // transaction provenance ⇒ confirm-onchain routes cspr.live /transaction/.
    expect(out.hashKind).toBe('transaction');
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
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'method not found' },
      }),
    );
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    expect(await adapter.healthCheck()).toEqual({
      ok: false,
      reason: 'rpc_-32601: method not found',
    });
  });
});
