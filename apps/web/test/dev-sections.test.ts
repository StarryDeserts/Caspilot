import { describe, expect, it } from 'vitest';
import { DEV_SECTIONS } from '../src/lib/dev-sections.js';

// Single source of truth for the developers-page anchor nav AND section order.
// The open-design source hand-wrote the nav and dropped the #reject link; deriving
// both nav + content from this one array makes that drift structurally impossible.
describe('DEV_SECTIONS', () => {
  it('lists the eight documented sections in order', () => {
    expect(DEV_SECTIONS.map((s) => s.id)).toEqual([
      'overview',
      'auth',
      'flow',
      'create',
      'validate',
      'trace',
      'reject',
      'errors',
    ]);
  });

  it('includes the reject section the source nav forgot', () => {
    expect(DEV_SECTIONS.some((s) => s.id === 'reject')).toBe(true);
  });

  it('has unique ids', () => {
    const ids = DEV_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every section a non-empty label', () => {
    for (const s of DEV_SECTIONS) expect(s.label.trim().length).toBeGreaterThan(0);
  });
});
