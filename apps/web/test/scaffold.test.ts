import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('apps/web scaffold', () => {
  const root = resolve(__dirname, '..');
  for (const f of [
    'package.json', 'tsconfig.json', 'next.config.mjs',
    'app/layout.tsx', 'app/page.tsx', 'app/globals.css',
    'tailwind.config.ts', 'postcss.config.mjs',
  ]) {
    it(`has ${f}`, () => expect(existsSync(resolve(root, f))).toBe(true));
  }
});
