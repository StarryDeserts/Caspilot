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
