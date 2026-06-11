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

describe('CasperDeployAdapter.submitSignedDeploy', () => {
  it('reattaches the signature and broadcasts a deploy that validates over its own hash', async () => {
    const { env, signerPk, signatureHex } = signedFixture();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { deploy_hash: env.bodyHashHex } }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    const { deployHash } = await adapter.submitSignedDeploy({ envelope: env, signatureHex, signerPk });

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
      .mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid' } }));
    const adapter = new CasperDeployAdapter({ url: RPC_URL, fetch: fetchMock });

    await expect(
      adapter.submitSignedDeploy({ envelope: env, signatureHex, signerPk }),
    ).rejects.toThrow('rpc_-32602');
  });
});
