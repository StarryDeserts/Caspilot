export type MeterLevel = 'ok' | 'warn' | 'crit';

// Tolerate a non-digit atomic amount by treating it as 0 rather than throwing in
// a render path — the backend already fails closed on corrupt ledger rows, so a
// bad value here is a display concern, not a budget decision.
function toBig(value: string): bigint {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

// Percent of `denom` represented by `numer`, to 1-decimal precision, clamped to
// [0,100]. BigInt math throughout so a large cep18 atomic amount never loses
// precision through Number(). A zero/invalid denominator yields 0 — no ratio.
function ratioPct(numerAtomic: string, denomAtomic: string): number {
  const denom = toBig(denomAtomic);
  if (denom <= 0n) return 0;
  const tenths = Number((toBig(numerAtomic) * 1000n) / denom);
  return Math.max(0, Math.min(1000, tenths)) / 10;
}

// Fraction of the day cap already consumed (reserved+committed).
export function meterPct(usedAtomic: string, capAtomic: string): number {
  return ratioPct(usedAtomic, capAtomic);
}

// Threshold colour for the meter: warn at >=80%, crit at >=90%.
export function meterClass(pct: number): MeterLevel {
  if (pct >= 90) return 'crit';
  if (pct >= 80) return 'warn';
  return 'ok';
}

// Where one max single payment sits as a fraction of the day cap — positions the
// cap marker on the meter so the viewer sees how much of the day a single
// payment can consume.
export function capMarkerPct(singleAtomic: string, capAtomic: string): number {
  return ratioPct(singleAtomic, capAtomic);
}

// Time remaining until the day cap resets, as "Hh MMm" (minutes zero-padded).
// The ledger's dayUtc rolls at UTC midnight, so the countdown targets the next
// UTC midnight — and floors the partial minute so it never claims more headroom-
// time than is left.
export function resetCountdown(nowMs: number): string {
  const d = new Date(nowMs);
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  const diff = Math.max(0, nextMidnight - nowMs);
  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
