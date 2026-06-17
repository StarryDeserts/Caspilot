// Hero stagger: each item carries a data-d index; it reveals at 100ms + d*80ms.
// Negative indices clamp to the base so a stray value can't schedule in the past.
export function heroRevealDelayMs(d: number): number {
  return 100 + Math.max(0, d) * 80;
}

// Motion gate. Defaults to motion-allowed when matchMedia is unavailable (SSR /
// old runtimes) — the reveal layer is progressive enhancement, so "unknown"
// must never block content from showing.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
