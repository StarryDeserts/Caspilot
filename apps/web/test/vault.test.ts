import { describe, expect, it } from 'vitest';
import { capMarkerPct, meterClass, meterPct, resetCountdown } from '../src/lib/vault.js';

describe('vault meter helpers', () => {
  describe('meterPct', () => {
    it('computes percent of cap used with 1-decimal precision (no Number() overflow)', () => {
      expect(meterPct('800', '100000')).toBe(0.8);
      expect(meterPct('50000', '100000')).toBe(50);
      // large atomic values stay precise via BigInt math
      expect(meterPct('900000000000', '1000000000000')).toBe(90);
    });

    it('clamps to 100 when usage meets or exceeds the cap', () => {
      expect(meterPct('100000', '100000')).toBe(100);
      expect(meterPct('150000', '100000')).toBe(100);
    });

    it('returns 0 for a zero or invalid cap (no ratio to show)', () => {
      expect(meterPct('500', '0')).toBe(0);
      expect(meterPct('500', '')).toBe(0);
    });

    it('treats a non-digit usage as 0 rather than throwing in a render path', () => {
      expect(meterPct('', '100000')).toBe(0);
      expect(meterPct('oops', '100000')).toBe(0);
    });
  });

  describe('meterClass', () => {
    it('is ok below 80, warn at >=80, crit at >=90', () => {
      expect(meterClass(0.8)).toBe('ok');
      expect(meterClass(79.9)).toBe('ok');
      expect(meterClass(80)).toBe('warn');
      expect(meterClass(89.9)).toBe('warn');
      expect(meterClass(90)).toBe('crit');
      expect(meterClass(100)).toBe('crit');
    });
  });

  describe('capMarkerPct', () => {
    it('positions one max single payment as a percent of the day cap', () => {
      expect(capMarkerPct('500', '100000')).toBe(0.5);
      expect(capMarkerPct('25000', '100000')).toBe(25);
    });

    it('clamps to 100 and guards a zero cap', () => {
      expect(capMarkerPct('200000', '100000')).toBe(100);
      expect(capMarkerPct('500', '0')).toBe(0);
    });
  });

  describe('resetCountdown', () => {
    it('counts down to the next UTC midnight as Hh MMm (minutes zero-padded)', () => {
      expect(resetCountdown(Date.parse('2026-06-17T12:00:00Z'))).toBe('12h 00m');
      // floors the partial minute rather than rounding up
      expect(resetCountdown(Date.parse('2026-06-17T12:00:30Z'))).toBe('11h 59m');
      expect(resetCountdown(Date.parse('2026-06-17T23:31:00Z'))).toBe('0h 29m');
    });
  });
});
