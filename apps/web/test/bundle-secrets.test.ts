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
    expect(result.violations[0]?.pattern).toBe('CSPR_CLOUD_KEY');
  });

  it('does not flag clean files', () => {
    const result = scanFiles([{ path: 'a.js', text: 'const k = "ok";' }]);
    expect(result.violations.length).toBe(0);
  });

  it('flags process.env.NAME and bracket-access leak shapes', () => {
    const a = scanFiles([{ path: 'a.js', text: 'const v = process.env.CSPR_CLOUD_KEY;' }], []);
    expect(a.violations.map((v) => v.pattern)).toContain('CSPR_CLOUD_KEY');
    const b = scanFiles([{ path: 'b.js', text: 'const v = e["PRIVATE_KEY"];' }], []);
    expect(b.violations.map((v) => v.pattern)).toContain('PRIVATE_KEY');
  });

  it('does not flag the frontend redaction denylist (bare quoted names)', () => {
    const denylist = 'new Set(["privateKey","PRIVATE_KEY","CSPR_CLOUD_KEY","reasoning","env"]);';
    const result = scanFiles([{ path: 'page.js', text: denylist }], []);
    expect(result.violations.length).toBe(0);
  });

  it('flags a real secret VALUE regardless of variable shape', () => {
    const leak = 'k7Qe' + 'a1b2c3d4'.repeat(4);
    const result = scanFiles(
      [{ path: 'chunk.js', text: `const x=${JSON.stringify(leak)};` }],
      [leak],
    );
    expect(result.violations.some((v) => v.pattern === 'SECRET_VALUE')).toBe(true);
  });
});
