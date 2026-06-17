import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORBIDDEN_SUBSTRINGS } from '../scripts/check-bundle-secrets.mjs';

describe('P5 acceptance', () => {
  it('NEXT_PUBLIC_* secret allowlist denies cloud + private key', () => {
    expect(FORBIDDEN_SUBSTRINGS).toEqual(expect.arrayContaining(['CSPR_CLOUD_KEY', 'PRIVATE_KEY']));
  });

  it('vault + intents pages are present', () => {
    const r = resolve(__dirname, '..');
    expect(existsSync(`${r}/app/(app)/vaults/page.tsx`)).toBe(true);
    expect(existsSync(`${r}/app/(app)/intents/page.tsx`)).toBe(true);
    expect(existsSync(`${r}/app/(app)/intents/[id]/page.tsx`)).toBe(true);
  });
});
