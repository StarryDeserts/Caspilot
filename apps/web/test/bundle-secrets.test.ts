import { describe, it, expect } from 'vitest';
import { scanFiles, FORBIDDEN_SUBSTRINGS } from '../scripts/check-bundle-secrets.mjs';

describe('bundle secret scanner', () => {
  it('FORBIDDEN_SUBSTRINGS includes cloud key + private key patterns', () => {
    expect(FORBIDDEN_SUBSTRINGS).toEqual(
      expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY', 'FACILITATOR_SECRET']),
    );
  });

  it('flags files containing forbidden substrings', () => {
    const result = scanFiles([{ path: 'a.js', text: 'const k = "CSPR_CLOUD_KEY=abc";' }]);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].pattern).toBe('CSPR_CLOUD_KEY');
  });

  it('does not flag clean files', () => {
    const result = scanFiles([{ path: 'a.js', text: 'const k = "ok";' }]);
    expect(result.violations.length).toBe(0);
  });
});
