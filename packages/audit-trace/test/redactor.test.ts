import { describe, it, expect } from 'vitest';
import { PlannerRedactor, FORBIDDEN_KEYS } from '../src/redactor.js';

describe('PlannerRedactor', () => {
  const r = new PlannerRedactor();

  it('strips forbidden keys at any depth', () => {
    const out = r.redact({
      intent: 'optimize yield',
      privateKey: 'never-leak',
      env: { PRIVATE_KEY: 'x', CSPR_CLOUD_KEY: 'y' },
      prompt: 'full prompt',
      reasoning: 'hidden chain of thought',
    });
    for (const k of FORBIDDEN_KEYS) {
      expect(JSON.stringify(out)).not.toMatch(new RegExp(k));
    }
  });

  it('preserves structured planner output (toolCalls, constraints, policyChecks)', () => {
    const out = r.redact({
      toolCalls: [{ name: 'fetch_yield', argsHash: 'abc' }],
      constraints: { maxAmount: '500' },
      policyChecks: [{ rule: 'amount', allowed: true }],
    });
    expect((out as Record<string, unknown>).toolCalls).toBeDefined();
    expect((out as Record<string, unknown>).constraints).toBeDefined();
    expect((out as Record<string, unknown>).policyChecks).toBeDefined();
  });

  it('throws when input is null/undefined (catch programming errors)', () => {
    expect(() => r.redact(undefined as unknown as Record<string, unknown>)).toThrow();
  });

  it('does not stringify Buffers (leak guard)', () => {
    const out = r.redact({ buf: Buffer.from('secret') });
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
