import { describe, it, expect } from 'vitest';
import {
  KeyAlgorithm,
  PrivateKey,
  Transaction,
  TransactionEntryPointEnum,
} from 'casper-js-sdk';
import { buildNativeTransferDeploy } from '../src/deploy-builder.js';

// Offline: on Casper 2.0 (Condor) a native CSPR transfer is a TransactionV1 —
// target Native, entry point Transfer, PaymentLimited pricing — NOT a legacy
// Deploy `transfer` session. The legacy session path reverts on-chain with
// "Invalid purse" under the 2.0 AddressableEntity account model, so the only
// shape that actually executes is the TransactionV1. The value moved IS native
// CSPR, so it can broadcast from any funded testnet wallet without a CEP-18
// balance. The user's wallet signs the resulting transaction hash later; this
// builder never holds a key, and the sender pubkey becomes the initiator so the
// user signs AND pays from their own wallet.
const FIXED_TS = 1_700_000_000_000;
const CHAIN = 'casper-test';
const PAYMENT = '100000000';
const HEX64 = /^[0-9a-f]{64}$/;

function keyHex(): string {
  // Non-checksummed (lowercase) hex, matching the CasperPublicKeyHex contract.
  return PrivateKey.generate(KeyAlgorithm.ED25519).publicKey.toHex(false);
}

// A real recipient public key — native transfers target a PublicKey, not an
// account-hash; the node credits the derived account's main purse.
const RECIPIENT = keyHex();

function nativeTransfer(
  sender: string,
  overrides: Partial<Parameters<typeof buildNativeTransferDeploy>[0]> = {},
) {
  return buildNativeTransferDeploy({
    chainName: CHAIN,
    senderPk: sender,
    paymentMotes: PAYMENT,
    // 2.5 CSPR — the casper-test minimum native transfer (in motes).
    recipient: RECIPIENT,
    amountMotes: '2500000000',
    timestampMs: FIXED_TS,
    ...overrides,
  });
}

describe('buildNativeTransferDeploy (Casper 2.0 TransactionV1)', () => {
  it('produces a TransactionV1 envelope whose body/payload hash is the single tx hash', () => {
    const env = nativeTransfer(keyHex());
    expect(env.bodyHashHex).toMatch(HEX64);
    expect(env.payloadHex).toMatch(HEX64);
    expect(typeof env.headerJson).toBe('object');
    // A TransactionV1 has ONE hash (no separate deploy-hash vs body-hash), so
    // both envelope fields carry it. (For a legacy Deploy these would differ.)
    expect(env.bodyHashHex).toBe(env.payloadHex);
  });

  it('is a native Transfer transaction initiated + paid by the sender (the user pays)', () => {
    const sender = keyHex();
    const env = nativeTransfer(sender);
    const tx = Transaction.fromJSON(env.headerJson);

    // It is a 2.0 TransactionV1, NOT a wrapped legacy Deploy.
    expect(tx.getTransactionV1()).toBeDefined();
    expect(tx.getDeploy()).toBeUndefined();
    // The envelope hash is the transaction hash the wallet will sign.
    expect(tx.hash.toHex()).toBe(env.bodyHashHex);
    expect(tx.hash.transactionV1).toBeDefined();
    expect(tx.hash.deploy).toBeUndefined();
    // Initiator IS the user's pubkey — they sign and pay gas + value.
    expect(tx.initiatorAddr.publicKey?.toHex(false)).toBe(sender);
    // Native mint transfer: entry point Transfer, target Native (not stored).
    expect(tx.entryPoint.type).toBe(TransactionEntryPointEnum.Transfer);
    expect(tx.target.native).toBeDefined();
    expect(tx.target.stored).toBeUndefined();
    expect(tx.target.session).toBeUndefined();
    // PaymentLimited pricing matching the live chainspec (gas price tolerance 1).
    expect(tx.pricingMode.paymentLimited?.paymentAmount).toBe(Number(PAYMENT));
    expect(tx.pricingMode.paymentLimited?.gasPriceTolerance).toBe(1);
    expect(tx.chainName).toBe(CHAIN);
  });

  it('binds the hash to recipient and amount (changing either changes the hash)', () => {
    const sender = keyHex();
    const base = nativeTransfer(sender);
    const otherAmount = nativeTransfer(sender, { amountMotes: '3000000000' });
    const otherRecipient = nativeTransfer(sender, { recipient: keyHex() });
    expect(otherAmount.bodyHashHex).not.toBe(base.bodyHashHex);
    expect(otherRecipient.bodyHashHex).not.toBe(base.bodyHashHex);
  });

  it('is deterministic for identical inputs (same sender + fixed timestamp + id)', () => {
    const sender = keyHex();
    expect(nativeTransfer(sender).bodyHashHex).toBe(nativeTransfer(sender).bodyHashHex);
  });

  it('rejects a malformed recipient public key', () => {
    expect(() => nativeTransfer(keyHex(), { recipient: 'not-a-pubkey' })).toThrow();
  });

  it('rejects a self-transfer (recipient equals sender → mint "Invalid purse" on-chain)', () => {
    // A native transfer moves CSPR between two purses; an equal source/target
    // purse is rejected by the mint on-chain (EqualSourceAndTarget, code 17),
    // surfaced to users as "Invalid purse" — the tx is mined and charged gas but
    // reverts, moving nothing. Refuse to build it so the wallet never pops and no
    // gas is wasted on a doomed transfer.
    const sender = keyHex();
    expect(() => nativeTransfer(sender, { recipient: sender })).toThrow(/self-transfer/i);
  });

  it('detects a self-transfer regardless of public-key hex case', () => {
    // The intent receiver is user-supplied and may be checksummed (mixed case),
    // while the SDK emits lowercase — compare normalized so an upper/lower variant
    // of the same key is still caught.
    const sender = keyHex();
    expect(() => nativeTransfer(sender, { recipient: sender.toUpperCase() })).toThrow(
      /self-transfer/i,
    );
  });
});
