import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('apps/web scaffold', () => {
  const root = resolve(__dirname, '..');
  for (const f of [
    'package.json',
    'tsconfig.json',
    'next.config.mjs',
    'app/layout.tsx',
    'app/(marketing)/page.tsx',
    'app/(app)/layout.tsx',
    'app/(app)/console/page.tsx',
    'app/design-system.css',
  ]) {
    it(`has ${f}`, () => expect(existsSync(resolve(root, f))).toBe(true));
  }

  // M5 removed Tailwind: the design system is hand-authored CSS, so the
  // Tailwind toolchain must be gone — not merely unused. Lock that in.
  for (const f of ['tailwind.config.ts', 'postcss.config.mjs', 'app/globals.css']) {
    it(`has no ${f}`, () => expect(existsSync(resolve(root, f))).toBe(false));
  }
});
