import { describe, it, expect, afterEach } from 'vitest';
import { heroRevealDelayMs, prefersReducedMotion } from '../src/lib/reveal.js';

describe('heroRevealDelayMs', () => {
  it('is a 100ms base plus 80ms per stagger index', () => {
    expect(heroRevealDelayMs(0)).toBe(100);
    expect(heroRevealDelayMs(1)).toBe(180);
    expect(heroRevealDelayMs(4)).toBe(420);
  });

  it('never dips below the base for a negative index', () => {
    expect(heroRevealDelayMs(-3)).toBe(100);
  });
});

describe('prefersReducedMotion', () => {
  const orig = window.matchMedia;
  afterEach(() => {
    (window as unknown as { matchMedia: unknown }).matchMedia = orig;
  });

  it('is true when the reduce query matches', () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
      matches: true,
      media: q,
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the reduce query does not match', () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
      matches: false,
      media: q,
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it('defaults to motion-allowed (false) when matchMedia is unavailable', () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});
