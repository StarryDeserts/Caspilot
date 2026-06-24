import { describe, it, expect } from 'vitest';
import { Deploy, KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import { buildCep18TransferDeploy } from '../src/deploy-builder.js';

// Offline: a CEP-18 `transfer` is just a versioned-package call with
// (recipient: Key, amount: U256) args. No network, no signing — the user's
// wallet signs the resulting hash later. We mirror the harness's live
// fundVault/transfer encoding so the API can build the same deploy keylessly.
const FIXED_TS = 1_700_000_000_000;
const CHAIN = 'casper-test';
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN_PACKAGE = 'c'.repeat(64);
const RECIPIENT_TAGGED = '00' + 'bb'.repeat(32); // demo tag 00 = account

function senderHex(): string {
  return PrivateKey.generate(KeyAlgorithm.ED25519).publicKey.toHex(false);
}

function transfer(
  sender: string,
  overrides: Partial<Parameters<typeof buildCep18TransferDeploy>[0]> = {},
) {
  return buildCep18TransferDeploy({
    chainName: CHAIN,
    senderPk: sender,
    paymentMotes: '3000000000',
    tokenPackage: TOKEN_PACKAGE,
    recipient: RECIPIENT_TAGGED,
    amount: '500',
    timestampMs: FIXED_TS,
    ...overrides,
  });
}

describe('buildCep18TransferDeploy', () => {
  it('produces a well-formed envelope whose bodyHashHex is the deploy hash', () => {
    const env = transfer(senderHex());
    expect(env.bodyHashHex).toMatch(HEX64);
    expect(env.payloadHex).toMatch(HEX64);
    expect(typeof env.headerJson).toBe('object');
    expect(env.bodyHashHex).not.toBe(env.payloadHex);
  });

  it('builds a versioned `transfer` call paid by the given sender (the user pays)', () => {
    const sender = senderHex();
    const env = transfer(sender);
    const back = Deploy.fromJSON(env.headerJson);

    expect(back.hash.toHex()).toBe(env.bodyHashHex);
    // The deploy account IS the user's pubkey — they sign and pay gas/token.
    expect(back.header.account?.toHex()).toBe(sender);
    // CEP-18 calls resolve through the token *package*'s latest version.
    expect(back.session.storedVersionedContractByHash).toBeDefined();
    expect(back.session.storedContractByHash).toBeUndefined();
    expect(back.session.moduleBytes).toBeUndefined();
    expect(back.session.storedVersionedContractByHash?.entryPoint).toBe('transfer');
  });

  it('binds the hash to recipient and amount (changing either changes the hash)', () => {
    const sender = senderHex();
    const base = transfer(sender);
    const otherAmount = transfer(sender, { amount: '501' });
    const otherReceiver = transfer(sender, { recipient: '00' + 'cd'.repeat(32) });
    expect(otherAmount.bodyHashHex).not.toBe(base.bodyHashHex);
    expect(otherReceiver.bodyHashHex).not.toBe(base.bodyHashHex);
  });

  it('accepts a 2-char-tagged 66-hex token package the same as a bare 64-hex one', () => {
    const sender = senderHex();
    const bare = transfer(sender, { tokenPackage: TOKEN_PACKAGE });
    const tagged = transfer(sender, { tokenPackage: '01' + TOKEN_PACKAGE });
    // Tag is stripped to the same bare package hash → identical deploy.
    expect(tagged.bodyHashHex).toBe(bare.bodyHashHex);
  });

  it('accepts an already-prefixed account-hash recipient', () => {
    const sender = senderHex();
    const tagged = transfer(sender, { recipient: '00' + 'bb'.repeat(32) });
    const prefixed = transfer(sender, { recipient: 'account-hash-' + 'bb'.repeat(32) });
    expect(prefixed.bodyHashHex).toBe(tagged.bodyHashHex);
  });

  it('rejects a malformed token package hash', () => {
    expect(() => transfer(senderHex(), { tokenPackage: 'not-hex' })).toThrow();
  });
});
