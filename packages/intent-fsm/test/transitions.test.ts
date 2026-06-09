import { describe, it, expect } from 'vitest';
import { canTransition, ALLOWED_TRANSITIONS, TERMINAL_STATES } from '../src/transitions.js';

describe('ALLOWED_TRANSITIONS', () => {
  it('happy path: DRAFT → POLICY_VALIDATED → PAYMENT_REQUIRED → PAYMENT_VERIFIED → READY_TO_SUBMIT → SIGNED_RECEIVED → ACCEPTED_BY_NODE → EXECUTED → FINALIZED', () => {
    const path = [
      'DRAFT',
      'POLICY_VALIDATED',
      'PAYMENT_REQUIRED',
      'PAYMENT_VERIFIED',
      'READY_TO_SUBMIT',
      'SIGNED_RECEIVED',
      'ACCEPTED_BY_NODE',
      'EXECUTED',
      'FINALIZED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping POLICY_VALIDATED', () => {
    expect(canTransition('DRAFT', 'PAYMENT_REQUIRED')).toBe(false);
  });

  it('REJECTED reachable from DRAFT or POLICY_VALIDATED', () => {
    expect(canTransition('DRAFT', 'REJECTED')).toBe(true);
    expect(canTransition('POLICY_VALIDATED', 'REJECTED')).toBe(true);
  });

  it('EXECUTION_FAILED reachable from ACCEPTED_BY_NODE', () => {
    expect(canTransition('ACCEPTED_BY_NODE', 'EXECUTION_FAILED')).toBe(true);
  });

  it('TIMEOUT reachable from any non-terminal state', () => {
    for (const s of [
      'DRAFT',
      'POLICY_VALIDATED',
      'PAYMENT_REQUIRED',
      'PAYMENT_VERIFIED',
      'READY_TO_SUBMIT',
      'SIGNED_RECEIVED',
      'ACCEPTED_BY_NODE',
    ] as const) {
      expect(canTransition(s, 'TIMEOUT')).toBe(true);
    }
  });

  it('terminal states cannot transition', () => {
    for (const t of TERMINAL_STATES) {
      expect(canTransition(t, 'DRAFT')).toBe(false);
    }
  });

  it('TIMEOUT is not the same as failure', () => {
    expect(TERMINAL_STATES).toContain('TIMEOUT');
    expect(TERMINAL_STATES).toContain('EXECUTION_FAILED');
    // semantic note: TIMEOUT does not imply EXECUTION_FAILED
    expect(canTransition('TIMEOUT', 'EXECUTION_FAILED')).toBe(false);
  });

  it('exposes ALLOWED_TRANSITIONS for inspection', () => {
    expect(Array.from(ALLOWED_TRANSITIONS.keys()).length).toBeGreaterThan(0);
  });
});
