import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SpendMeter } from '../src/components/SpendMeter.js';
import type { RecentDebit } from '../src/lib/api.js';

const NOW = Date.parse('2026-06-17T12:00:00Z');

function debit(
  over: Partial<RecentDebit> & Pick<RecentDebit, 'amount' | 'status' | 'intentId'>,
): RecentDebit {
  return { traceId: 'trace', atMs: NOW, ...over };
}

function setMatchMedia(matches: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    matches,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    onchange: null,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  (window as unknown as { matchMedia: unknown }).matchMedia = undefined;
});

describe('SpendMeter', () => {
  it('shows the day-cap percent used with threshold color and used/cap amounts', () => {
    render(
      <SpendMeter
        usedAtomic="800"
        capAtomic="100000"
        singleAtomic="500"
        debits={[debit({ amount: '800', status: 'committed', intentId: 'int_a' })]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText('0.8% used')).toBeTruthy();
    expect(screen.getByText('800')).toBeTruthy();
    expect(screen.getByText('100,000')).toBeTruthy();
  });

  it('renders one segment per debit, colored by status and sized to its share of the cap', () => {
    const { container } = render(
      <SpendMeter
        usedAtomic="800"
        capAtomic="100000"
        singleAtomic="500"
        debits={[
          debit({ amount: '500', status: 'committed', intentId: 'int_a' }),
          debit({ amount: '300', status: 'reserved', intentId: 'int_b' }),
        ]}
        nowMs={NOW}
      />,
    );
    const segs = container.querySelectorAll<HTMLElement>('.meter-seg');
    expect(segs.length).toBe(2);
    expect(segs[0]?.classList.contains('committed')).toBe(true);
    expect(segs[0]?.style.width).toBe('0.5%');
    expect(segs[1]?.classList.contains('reserved')).toBe(true);
    expect(segs[1]?.style.width).toBe('0.3%');
  });

  it('positions the single-payment cap marker at its share of the cap', () => {
    const { container } = render(
      <SpendMeter usedAtomic="0" capAtomic="100000" singleAtomic="25000" debits={[]} nowMs={NOW} />,
    );
    const marker = container.querySelector<HTMLElement>('.sm-marker');
    expect(marker).not.toBeNull();
    expect(marker?.style.left).toBe('25%');
  });

  it('escalates to crit color at >=90% used', () => {
    render(
      <SpendMeter
        usedAtomic="95000"
        capAtomic="100000"
        singleAtomic="500"
        debits={[]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText('95% used').className).toMatch(/crit/);
  });

  it('shows a static reset countdown from nowMs and does not tick under reduced motion', () => {
    setMatchMedia(true); // prefers-reduced-motion: reduce
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(
      <SpendMeter usedAtomic="0" capAtomic="100000" singleAtomic="500" debits={[]} nowMs={NOW} />,
    );
    expect(screen.getByText(/resets in 12h 00m/i)).toBeTruthy();
    // advance two hours of wall clock — the reduced-motion meter must not re-read it
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    });
    expect(screen.getByText(/resets in 12h 00m/i)).toBeTruthy();
  });

  it('ticks the countdown live when motion is allowed', () => {
    setMatchMedia(false); // motion allowed
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(
      <SpendMeter usedAtomic="0" capAtomic="100000" singleAtomic="500" debits={[]} nowMs={NOW} />,
    );
    expect(screen.getByText(/resets in 12h 00m/i)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000); // 31 minutes later
    });
    expect(screen.getByText(/resets in 11h 29m/i)).toBeTruthy();
  });
});
