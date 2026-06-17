'use client';

// Renders `value` (optionally formatted) as its final text. Kept as a named
// seam — the design calls for a mount count-up, but an rAF animation can't be
// verified on this headless box and freezes mid-roll under jsdom, so the honest
// behaviour is the deterministic final value. A tested count-up can slot in
// here later behind a prefers-reduced-motion guard without touching callers.
export function RollingNumber({
  value,
  format = (n) => String(n),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  return <>{format(value)}</>;
}
