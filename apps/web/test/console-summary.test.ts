import { describe, it, expect } from 'vitest';
import { summarizeConsole } from '../src/lib/console-summary.js';
import type { IntentSummary } from '../src/lib/api.js';

// Noon UTC on 2026-06-16 — comfortably mid-day so "today" and "yesterday"
// fixtures never straddle a boundary by accident.
const NOW = Date.UTC(2026, 5, 16, 12, 0, 0);
const TODAY_MIDNIGHT = Date.UTC(2026, 5, 16, 0, 0, 0);
const TODAY_9AM = Date.UTC(2026, 5, 16, 9, 0, 0);
const YESTERDAY_11PM = Date.UTC(2026, 5, 15, 23, 0, 0);

function intent(over: Partial<IntentSummary> & Pick<IntentSummary, 'id' | 'state'>): IntentSummary {
  return {
    agent: `00${'a'.repeat(64)}`,
    receiver: `00${'b'.repeat(64)}`,
    token: 'cspr-test-cep18',
    contract: `00${'c'.repeat(64)}`,
    network: 'casper:casper-test',
    amount: '500',
    updatedAtMs: NOW,
    ...over,
  };
}

describe('summarizeConsole', () => {
  it('returns all-zero counts for an empty list', () => {
    expect(summarizeConsole([], NOW)).toEqual({
      active: 0,
      awaitingPolicy: 0,
      executedToday: 0,
      rejectedToday: 0,
    });
  });

  it('counts every non-terminal intent as active', () => {
    const seed: IntentSummary[] = [
      intent({ id: 'd', state: 'DRAFT' }),
      intent({ id: 'v', state: 'POLICY_VALIDATED' }),
      intent({ id: 'pr', state: 'PAYMENT_REQUIRED' }),
      intent({ id: 'pv', state: 'PAYMENT_VERIFIED' }),
      intent({ id: 'rts', state: 'READY_TO_SUBMIT' }),
      intent({ id: 'sr', state: 'SIGNED_RECEIVED' }),
      intent({ id: 'abn', state: 'ACCEPTED_BY_NODE' }),
      // terminal — must NOT count as active
      intent({ id: 'e', state: 'EXECUTED' }),
      intent({ id: 'f', state: 'FINALIZED' }),
      intent({ id: 'rej', state: 'REJECTED' }),
      intent({ id: 'ef', state: 'EXECUTION_FAILED' }),
      intent({ id: 't', state: 'TIMEOUT' }),
    ];
    expect(summarizeConsole(seed, NOW).active).toBe(7);
  });

  it('counts only DRAFT intents as awaiting policy', () => {
    const seed: IntentSummary[] = [
      intent({ id: 'd1', state: 'DRAFT' }),
      intent({ id: 'd2', state: 'DRAFT' }),
      intent({ id: 'v', state: 'POLICY_VALIDATED' }),
      intent({ id: 'e', state: 'EXECUTED' }),
    ];
    expect(summarizeConsole(seed, NOW).awaitingPolicy).toBe(2);
  });

  it('counts EXECUTED and FINALIZED from today, excluding earlier days', () => {
    const seed: IntentSummary[] = [
      intent({ id: 'e_now', state: 'EXECUTED', updatedAtMs: NOW }),
      intent({ id: 'e_9am', state: 'EXECUTED', updatedAtMs: TODAY_9AM }),
      intent({ id: 'f_midnight', state: 'FINALIZED', updatedAtMs: TODAY_MIDNIGHT }),
      intent({ id: 'e_yesterday', state: 'EXECUTED', updatedAtMs: YESTERDAY_11PM }),
      intent({ id: 'v_today', state: 'POLICY_VALIDATED', updatedAtMs: NOW }),
    ];
    expect(summarizeConsole(seed, NOW).executedToday).toBe(3);
  });

  it('counts REJECTED, EXECUTION_FAILED and TIMEOUT from today, excluding earlier days', () => {
    const seed: IntentSummary[] = [
      intent({ id: 'rej_today', state: 'REJECTED', updatedAtMs: TODAY_9AM }),
      intent({ id: 'ef_today', state: 'EXECUTION_FAILED', updatedAtMs: NOW }),
      intent({ id: 't_today', state: 'TIMEOUT', updatedAtMs: TODAY_MIDNIGHT }),
      intent({ id: 'rej_yesterday', state: 'REJECTED', updatedAtMs: YESTERDAY_11PM }),
      intent({ id: 'e_today', state: 'EXECUTED', updatedAtMs: NOW }),
    ];
    expect(summarizeConsole(seed, NOW).rejectedToday).toBe(3);
  });

  it('treats the UTC midnight boundary as the start of today (inclusive)', () => {
    const justBefore = TODAY_MIDNIGHT - 1;
    const seed: IntentSummary[] = [
      intent({ id: 'boundary_in', state: 'EXECUTED', updatedAtMs: TODAY_MIDNIGHT }),
      intent({ id: 'boundary_out', state: 'EXECUTED', updatedAtMs: justBefore }),
    ];
    expect(summarizeConsole(seed, NOW).executedToday).toBe(1);
  });
});
