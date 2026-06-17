import { describe, it, expect } from 'vitest';
import {
  relativeTime,
  truncateId,
  truncateHash,
  formatAmount,
  matchesFilter,
  matchesSearch,
  filterCounts,
  sortByUpdatedDesc,
  FILTERS,
  type FilterKey,
} from '../src/lib/intent-list.js';
import type { IntentSummary } from '../src/lib/api.js';

function intent(over: Partial<IntentSummary> = {}): IntentSummary {
  return {
    id: 'int_79q889lu7ofm08hsacc2pp5n5v',
    state: 'DRAFT',
    agent: '00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    receiver: '00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    token: 'cspr-test-cep18',
    contract: '00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    network: 'casper:casper-test',
    amount: '500',
    updatedAtMs: 1_781_595_000_000,
    ...over,
  };
}

describe('relativeTime', () => {
  const now = 2_000_000_000_000;
  it('reads "just now" within the first 10 seconds', () => {
    expect(relativeTime(now, now)).toBe('just now');
    expect(relativeTime(now - 9_000, now)).toBe('just now');
  });
  it('reads seconds, minutes, hours, then days', () => {
    expect(relativeTime(now - 40_000, now)).toBe('40s ago');
    expect(relativeTime(now - 120_000, now)).toBe('2m ago');
    expect(relativeTime(now - 3_600_000, now)).toBe('1h ago');
    expect(relativeTime(now - 90_000_000, now)).toBe('1d ago');
  });
  it('never reports a negative age for a clock-skewed future stamp', () => {
    expect(relativeTime(now + 5_000, now)).toBe('just now');
  });
});

describe('truncateId / truncateHash', () => {
  it('keeps the first 11 chars of a long id and ellipsizes', () => {
    expect(truncateId('int_79q889lu7ofm08hsacc2pp5n5v')).toBe('int_79q889l…');
  });
  it('returns a short id unchanged', () => {
    expect(truncateId('int_3hdp2en')).toBe('int_3hdp2en');
  });
  it('shows the leading 4 chars of an account hash', () => {
    expect(truncateHash('00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(
      '00aa…',
    );
  });
});

describe('formatAmount', () => {
  it('groups the integer part with thousands separators', () => {
    expect(formatAmount('500')).toBe('500');
    expect(formatAmount('1200')).toBe('1,200');
    expect(formatAmount('10000')).toBe('10,000');
    expect(formatAmount('1000000')).toBe('1,000,000');
  });
  it('preserves a decimal fraction while grouping the integer part', () => {
    expect(formatAmount('1234.5')).toBe('1,234.5');
    expect(formatAmount('25.00')).toBe('25.00');
  });
  it('returns a non-numeric value unchanged', () => {
    expect(formatAmount('')).toBe('');
    expect(formatAmount('n/a')).toBe('n/a');
  });
});

describe('matchesFilter', () => {
  it('"all" admits every state', () => {
    for (const s of ['DRAFT', 'PAYMENT_REQUIRED', 'EXECUTED', 'REJECTED', 'TIMEOUT']) {
      expect(matchesFilter(s, 'all')).toBe(true);
    }
  });
  it('maps each named segment to its FSM states', () => {
    expect(matchesFilter('DRAFT', 'draft')).toBe(true);
    expect(matchesFilter('POLICY_VALIDATED', 'validated')).toBe(true);
    expect(matchesFilter('EXECUTED', 'executed')).toBe(true);
    expect(matchesFilter('FINALIZED', 'executed')).toBe(true);
    expect(matchesFilter('REJECTED', 'rejected')).toBe(true);
    expect(matchesFilter('EXECUTION_FAILED', 'rejected')).toBe(true);
    expect(matchesFilter('TIMEOUT', 'rejected')).toBe(true);
  });
  it('keeps in-flight states out of every named segment (only "all" shows them)', () => {
    for (const f of ['draft', 'validated', 'executed', 'rejected'] as FilterKey[]) {
      expect(matchesFilter('PAYMENT_REQUIRED', f)).toBe(false);
    }
  });
});

describe('matchesSearch', () => {
  it('is true for an empty query', () => {
    expect(matchesSearch(intent(), '')).toBe(true);
    expect(matchesSearch(intent(), '   ')).toBe(true);
  });
  it('matches case-insensitively on id or agent', () => {
    expect(matchesSearch(intent({ id: 'int_ABC123' }), 'abc')).toBe(true);
    expect(matchesSearch(intent({ agent: '00DEADBEEF' }), 'deadbeef')).toBe(true);
  });
  it('does not match on receiver or token', () => {
    expect(matchesSearch(intent({ receiver: '00ffff', token: 'usdc' }), 'usdc')).toBe(false);
    expect(matchesSearch(intent({ receiver: '00ffff' }), 'ffff')).toBe(false);
  });
});

describe('filterCounts', () => {
  it('counts every segment, with "all" as the total', () => {
    const list = [
      intent({ state: 'DRAFT' }),
      intent({ state: 'DRAFT' }),
      intent({ state: 'POLICY_VALIDATED' }),
      intent({ state: 'POLICY_VALIDATED' }),
      intent({ state: 'EXECUTED' }),
      intent({ state: 'EXECUTED' }),
      intent({ state: 'REJECTED' }),
      intent({ state: 'PAYMENT_REQUIRED' }),
    ];
    expect(filterCounts(list)).toEqual({
      all: 8,
      draft: 2,
      validated: 2,
      executed: 2,
      rejected: 1,
    });
  });
});

describe('sortByUpdatedDesc', () => {
  it('orders newest first without mutating the input', () => {
    const input = [
      intent({ id: 'a', updatedAtMs: 100 }),
      intent({ id: 'b', updatedAtMs: 300 }),
      intent({ id: 'c', updatedAtMs: 200 }),
    ];
    const out = sortByUpdatedDesc(input);
    expect(out.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('FILTERS', () => {
  it('lists the five segments in display order with labels', () => {
    expect(FILTERS.map((f) => f.key)).toEqual(['all', 'draft', 'validated', 'executed', 'rejected']);
    expect(FILTERS.map((f) => f.label)).toEqual([
      'All',
      'Draft',
      'Validated',
      'Executed',
      'Rejected',
    ]);
  });
});
