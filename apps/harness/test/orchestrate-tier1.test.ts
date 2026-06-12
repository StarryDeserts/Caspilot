import { describe, it, expect } from 'vitest';
import {
  orchestrateTier1,
  type StepOutcome,
  type Tier1ChainOps,
  type Tier1OrchestrationInput,
} from '../src/orchestrate-tier1.js';

// Fully offline: the on-chain effects are injected (Tier1ChainOps). These tests
// exercise the orchestration logic — step order, recovered-hash threading,
// accept/reject outcome validation, and event assembly — not any real broadcast.

const CEP18_PKG = 'a'.repeat(64);
const VAULT_PKG = 'b'.repeat(64);
const VAULT_CONTRACT = `00${'c'.repeat(64)}`;
const VAULT_DEPLOY = 'd'.repeat(64);
const PAY_DEPLOY = 'e'.repeat(64);
const REJ3_DEPLOY = '3'.repeat(64);
const REJ4_DEPLOY = '4'.repeat(64);

const RECEIVER = `00${'c'.repeat(64)}`;
const BLOCKED = `00${'d'.repeat(64)}`;

function baseInput(): Tier1OrchestrationInput {
  return {
    paySuccess: { receiver: RECEIVER, amount: '50' },
    rejections: [
      { kind: 'receiver_not_allowed', receiver: BLOCKED, amount: '50', expectedErrorCode: 3 },
      { kind: 'over_max_single_payment', receiver: RECEIVER, amount: '999', expectedErrorCode: 4 },
    ],
    fundAmount: '50',
  };
}

const ok = (finalizedHeight: number, deployHash = '1'.repeat(64)): StepOutcome => ({
  deployHash,
  finalizedHeight,
  success: true,
});
const reverts = (errorCode: number, finalizedHeight: number, deployHash: string): StepOutcome => ({
  deployHash,
  finalizedHeight,
  success: false,
  errorCode,
});

interface Call {
  op: string;
  args?: unknown;
}

/**
 * A recording fake. `pay` returns the next scripted outcome each call so a test
 * can stage accept-then-reject-then-reject without coupling to input shape.
 */
function fakeOps(
  overrides: Partial<Tier1ChainOps> = {},
  payScript?: StepOutcome[],
): {
  ops: Tier1ChainOps;
  calls: Call[];
} {
  const calls: Call[] = [];
  const log = (op: string, args?: unknown) =>
    calls.push(args === undefined ? { op } : { op, args });
  const pays = payScript ?? [
    ok(20, PAY_DEPLOY),
    reverts(3, 21, REJ3_DEPLOY),
    reverts(4, 22, REJ4_DEPLOY),
  ];

  const ops: Tier1ChainOps = {
    installCep18: async () => {
      log('installCep18');
      return ok(10);
    },
    recoverPackageHash: async (name) => {
      log('recoverPackageHash', name);
      return name === 'Cep18' ? CEP18_PKG : VAULT_PKG;
    },
    installVault: async (i) => {
      log('installVault', i);
      return ok(11, VAULT_DEPLOY);
    },
    recoverVaultContractHash: async (pkg) => {
      log('recoverVaultContractHash', pkg);
      return VAULT_CONTRACT;
    },
    allowAgent: async (i) => {
      log('allowAgent', i);
      return ok(12);
    },
    allowReceiver: async (i) => {
      log('allowReceiver', i);
      return ok(13);
    },
    fundVault: async (i) => {
      log('fundVault', i);
      return ok(14);
    },
    pay: async (i) => {
      log('pay', i);
      const out = pays.shift();
      if (!out) throw new Error('unexpected extra pay() call');
      return out;
    },
    ...overrides,
  };
  return { ops, calls };
}

describe('orchestrateTier1', () => {
  it('runs the full sequence and assembles a tier1-events object', async () => {
    const { ops, calls } = fakeOps();

    const events = await orchestrateTier1(baseInput(), ops);

    expect(events.vault).toEqual({
      contractHash: VAULT_CONTRACT,
      deployHash: VAULT_DEPLOY,
      finalizedHeight: 11,
    });
    expect(events.paySuccess).toEqual({
      deployHash: PAY_DEPLOY,
      amount: '50',
      receiver: RECEIVER,
      finalizedHeight: 20,
    });
    expect(events.rejections).toEqual([
      { kind: 'receiver_not_allowed', deployHash: REJ3_DEPLOY, errorCode: 3, finalizedHeight: 21 },
      {
        kind: 'over_max_single_payment',
        deployHash: REJ4_DEPLOY,
        errorCode: 4,
        finalizedHeight: 22,
      },
    ]);

    // Setup must precede the accepted pay; the first pay is the accepted one.
    const order = calls.map((c) => c.op);
    expect(order.slice(0, 8)).toEqual([
      'installCep18',
      'recoverPackageHash',
      'installVault',
      'recoverPackageHash',
      'recoverVaultContractHash',
      'allowAgent',
      'allowReceiver',
      'fundVault',
    ]);
    expect(order.slice(8)).toEqual(['pay', 'pay', 'pay']);
  });

  it('threads the recovered package + contract hashes into later steps', async () => {
    const { ops, calls } = fakeOps();
    await orchestrateTier1(baseInput(), ops);

    expect(calls).toContainEqual({ op: 'installVault', args: { cep18PackageHash: CEP18_PKG } });
    expect(calls).toContainEqual({ op: 'allowAgent', args: { vaultPackageHash: VAULT_PKG } });
    expect(calls).toContainEqual({
      op: 'allowReceiver',
      args: { vaultPackageHash: VAULT_PKG, receiver: RECEIVER },
    });
    expect(calls).toContainEqual({
      op: 'fundVault',
      args: { cep18PackageHash: CEP18_PKG, vaultContractHash: VAULT_CONTRACT, amount: '50' },
    });
    expect(calls).toContainEqual({
      op: 'pay',
      args: { vaultPackageHash: VAULT_PKG, receiver: RECEIVER, amount: '50' },
    });
  });

  it('throws when the accepted pay reverts (never records a broken paySuccess)', async () => {
    const { ops } = fakeOps({}, [reverts(8, 20, PAY_DEPLOY)]);
    await expect(orchestrateTier1(baseInput(), ops)).rejects.toThrow(/accepted pay/i);
  });

  it('throws when a rejection is unexpectedly accepted on chain', async () => {
    const { ops } = fakeOps({}, [ok(20, PAY_DEPLOY), ok(21, REJ3_DEPLOY)]);
    await expect(orchestrateTier1(baseInput(), ops)).rejects.toThrow(
      /receiver_not_allowed.*accept|accept.*receiver_not_allowed/i,
    );
  });

  it('throws when a rejection reverts with the wrong error code', async () => {
    // receiver_not_allowed should be code 3; chain returns 2 → mismatch is fatal.
    const { ops } = fakeOps({}, [ok(20, PAY_DEPLOY), reverts(2, 21, REJ3_DEPLOY)]);
    await expect(orchestrateTier1(baseInput(), ops)).rejects.toThrow(
      /code 2.*expected 3|expected 3.*got 2|expected 3/i,
    );
  });

  it('throws when a setup step (allow_receiver) reverts', async () => {
    const { ops } = fakeOps({ allowReceiver: async () => reverts(99, 13, '9'.repeat(64)) });
    await expect(orchestrateTier1(baseInput(), ops)).rejects.toThrow(/allow_receiver|setup/i);
  });
});
