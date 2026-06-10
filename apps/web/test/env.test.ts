import { describe, it, expect } from 'vitest';
import { validatePublicEnv, FORBIDDEN_PUBLIC_KEYS } from '../src/lib/env.js';

describe('public env guard', () => {
  it('accepts only NEXT_PUBLIC_* with no privileged names', () => {
    const ok = validatePublicEnv({
      NEXT_PUBLIC_CASPILOT_API_BASE: 'http://localhost:8787',
      NEXT_PUBLIC_CASPER_NETWORK: 'casper-test',
    });
    expect(ok.NEXT_PUBLIC_CASPILOT_API_BASE).toBe('http://localhost:8787');
  });

  it('throws if any privileged key leaks into NEXT_PUBLIC_*', () => {
    expect(() =>
      validatePublicEnv({ NEXT_PUBLIC_CSPR_CLOUD_KEY: 'leaked' } as Record<string, string>),
    ).toThrow(/CSPR_CLOUD_KEY/);
  });

  it('FORBIDDEN_PUBLIC_KEYS includes cloud key + private key + mnemonic', () => {
    expect(FORBIDDEN_PUBLIC_KEYS).toEqual(
      expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY', 'MNEMONIC', 'SEED']),
    );
  });
});
