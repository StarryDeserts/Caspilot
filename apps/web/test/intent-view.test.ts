import { describe, it, expect } from 'vitest';
import {
  HAPPY_PATH,
  OFF_RAMP,
  deriveIntent,
  buildStepper,
} from '../src/lib/intent-view.js';
import type { TraceEntry } from '../src/lib/api.js';

function entry(over: Partial<TraceEntry> & { state: string; kind: string }): TraceEntry {
  return {
    intentId: 'int_x',
    atMs: 0,
    payload: undefined,
    ...over,
  };
}

const BODY = {
  agent: `00${'aa'.repeat(32)}`,
  receiver: `00${'bb'.repeat(32)}`,
  token: 'cspr-test-cep18',
  contract: `00${'cc'.repeat(32)}`,
  network: 'casper:casper-test',
  amount: '500',
};

// Server sends entries oldest-first (ORDER BY at_ms ASC).
const created = entry({ state: 'DRAFT', kind: 'created', atMs: 1, payload: { body: BODY } });
const validated = entry({
  state: 'POLICY_VALIDATED',
  kind: 'policy_check',
  atMs: 2,
  payload: { allowed: true, policyDigest: 'bfc091a0' },
});
const executed = entry({
  state: 'EXECUTED',
  kind: 'execution',
  atMs: 3,
  payload: { deployHash: 'ab'.repeat(32) },
});

describe('intent-view constants', () => {
  it('HAPPY_PATH is the 9 happy-path states in order', () => {
    expect([...HAPPY_PATH]).toEqual([
      'DRAFT',
      'POLICY_VALIDATED',
      'PAYMENT_REQUIRED',
      'PAYMENT_VERIFIED',
      'READY_TO_SUBMIT',
      'SIGNED_RECEIVED',
      'ACCEPTED_BY_NODE',
      'EXECUTED',
      'FINALIZED',
    ]);
  });

  it('OFF_RAMP is the 3 terminal-bad states', () => {
    expect([...OFF_RAMP]).toEqual(['REJECTED', 'EXECUTION_FAILED', 'TIMEOUT']);
  });
});

describe('deriveIntent', () => {
  it('reads the latest state and the proposed body from a created row', () => {
    const v = deriveIntent([created]);
    expect(v.state).toBe('DRAFT');
    expect(v.body).toEqual(BODY);
    expect(v.policyDigest).toBeUndefined();
    expect(v.deployHash).toBeUndefined();
  });

  it('captures policyDigest from an allowed policy_check', () => {
    const v = deriveIntent([created, validated]);
    expect(v.state).toBe('POLICY_VALIDATED');
    expect(v.policyDigest).toBe('bfc091a0');
    expect(v.rejectionCode).toBeUndefined();
  });

  it('captures deployHash from an execution row', () => {
    const v = deriveIntent([created, validated, executed]);
    expect(v.state).toBe('EXECUTED');
    expect(v.deployHash).toBe('ab'.repeat(32));
  });

  it('captures the chain-resolved hashKind from a V1 execution row (for the cspr.live URL kind)', () => {
    // confirm-onchain records the verifier's chain-resolved hashKind on the EXECUTED
    // row. A Casper 2.0 native transfer resolves as a transaction, so the view must
    // surface deployHashKind:'transaction' to route /transaction/<hash>, not /deploy/.
    const v1 = entry({
      state: 'EXECUTED',
      kind: 'execution',
      atMs: 3,
      payload: { deployHash: 'cd'.repeat(32), hashKind: 'transaction' },
    });
    const v = deriveIntent([created, validated, v1]);
    expect(v.deployHash).toBe('cd'.repeat(32));
    expect(v.deployHashKind).toBe('transaction');
  });

  it('leaves deployHashKind undefined when an execution row omits hashKind (legacy deploy)', () => {
    const v = deriveIntent([created, validated, executed]);
    expect(v.deployHashKind).toBeUndefined();
  });

  it('captures rejectionCode from a denied policy_check (policy off-ramp)', () => {
    const denied = entry({
      state: 'REJECTED',
      kind: 'policy_check',
      atMs: 2,
      payload: { allowed: false, code: 'receiver_not_allowed' },
    });
    const v = deriveIntent([created, denied]);
    expect(v.state).toBe('REJECTED');
    expect(v.rejectionCode).toBe('receiver_not_allowed');
    expect(v.policyDigest).toBeUndefined();
  });

  it('captures rejectionReason from a manual reject row', () => {
    const rejected = entry({
      state: 'REJECTED',
      kind: 'rejected',
      atMs: 3,
      payload: { reason: 'amount exceeds vault cap' },
    });
    const v = deriveIntent([created, validated, rejected]);
    expect(v.state).toBe('REJECTED');
    expect(v.rejectionReason).toBe('amount exceeds vault cap');
  });

  it('returns an empty view for no entries', () => {
    expect(deriveIntent([])).toEqual({});
  });
});

describe('buildStepper', () => {
  it('marks done before, current at, future after the latest happy state', () => {
    const { steps, activeOffRamp } = buildStepper([created, validated]);
    const byState = Object.fromEntries(steps.map((s) => [s.state, s.status]));
    expect(byState.DRAFT).toBe('done');
    expect(byState.POLICY_VALIDATED).toBe('current');
    expect(byState.PAYMENT_REQUIRED).toBe('future');
    expect(byState.FINALIZED).toBe('future');
    expect(activeOffRamp).toBeUndefined();
    // exactly one amber focus
    expect(steps.filter((s) => s.status === 'current')).toHaveLength(1);
  });

  it('does NOT fabricate skipped states as done on the mark-executed fast-forward', () => {
    // Demo collapses PAYMENT_REQUIRED..ACCEPTED_BY_NODE: trace jumps
    // POLICY_VALIDATED -> EXECUTED. Those skipped nodes never happened, so they
    // must read 'future', not 'done'. done === actually appeared in the trace.
    const { steps } = buildStepper([created, validated, executed]);
    const byState = Object.fromEntries(steps.map((s) => [s.state, s.status]));
    expect(byState.DRAFT).toBe('done');
    expect(byState.POLICY_VALIDATED).toBe('done');
    expect(byState.PAYMENT_REQUIRED).toBe('future');
    expect(byState.ACCEPTED_BY_NODE).toBe('future');
    expect(byState.EXECUTED).toBe('current');
    expect(byState.FINALIZED).toBe('future');
    expect(steps.filter((s) => s.status === 'current')).toHaveLength(1);
  });

  it('greens a connector only when BOTH endpoints were reached (no green dangling into a skipped node)', () => {
    // The fast-forward leaves POLICY_VALIDATED done but PAYMENT_REQUIRED never reached.
    // A connector represents a real transition, so it is green only when both of its
    // endpoints appear in the trace — DRAFT->POLICY_VALIDATED here. POLICY_VALIDATED's
    // connector must NOT dangle green into the grey, never-reached PAYMENT_REQUIRED node.
    const { steps } = buildStepper([created, validated, executed]);
    const linkByState = Object.fromEntries(steps.map((s) => [s.state, s.linkDone]));
    expect(linkByState.DRAFT).toBe(true); // DRAFT -> POLICY_VALIDATED, both reached
    expect(linkByState.POLICY_VALIDATED).toBe(false); // -> PAYMENT_REQUIRED, never reached
    expect(linkByState.ACCEPTED_BY_NODE).toBe(false); // -> EXECUTED, left side not reached
    expect(linkByState.EXECUTED).toBe(false); // -> FINALIZED, not reached
    expect(linkByState.FINALIZED).toBe(false); // terminal node, no connector
  });

  it('greens every connector when the full happy path was reached', () => {
    const full = HAPPY_PATH.map((state, i) => entry({ state, kind: 'created', atMs: i + 1 }));
    const { steps } = buildStepper(full);
    // Every node but the last bridges to a reached neighbour, so all connectors are green.
    for (const s of steps.slice(0, -1)) expect(s.linkDone).toBe(true);
    expect(steps[steps.length - 1]?.linkDone).toBe(false);
  });

  it('on a terminal-bad off-ramp, reached nodes are done, none current, off-ramp flagged', () => {
    const rejected = entry({ state: 'REJECTED', kind: 'rejected', atMs: 3, payload: { reason: 'x' } });
    const { steps, activeOffRamp } = buildStepper([created, validated, rejected]);
    const byState = Object.fromEntries(steps.map((s) => [s.state, s.status]));
    expect(byState.DRAFT).toBe('done');
    expect(byState.POLICY_VALIDATED).toBe('done');
    expect(byState.PAYMENT_REQUIRED).toBe('future');
    expect(steps.filter((s) => s.status === 'current')).toHaveLength(0);
    expect(activeOffRamp).toBe('REJECTED');
  });

  it('returns 9 happy-path step nodes in canonical order', () => {
    const { steps } = buildStepper([created]);
    expect(steps.map((s) => s.state)).toEqual([...HAPPY_PATH]);
  });
});
