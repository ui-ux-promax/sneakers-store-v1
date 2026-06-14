import { describe, it, expect } from 'vitest';
import {
  PERIOD_VALUES,
  DEFAULT_PERIOD,
  resolvePeriod,
  computeTrend,
  classifyStockTier,
  fillRevenueSeries,
} from '@/lib/admin/analytics';

describe('analytics pure core', () => {
  it('PERIOD_VALUES + default', () => {
    expect(PERIOD_VALUES).toEqual([7, 30, 90]);
    expect(DEFAULT_PERIOD).toBe(30);
  });

  describe('resolvePeriod', () => {
    const now = new Date('2026-06-14T12:00:00.000Z');

    it('defaults to 30 on missing/garbage', () => {
      expect(resolvePeriod({}, now).days).toBe(30);
      expect(resolvePeriod({ period: 'abc' }, now).days).toBe(30);
      expect(resolvePeriod({ period: '5' }, now).days).toBe(30);
    });

    it('accepts whitelisted values', () => {
      expect(resolvePeriod({ period: '7' }, now).days).toBe(7);
      expect(resolvePeriod({ period: '90' }, now).days).toBe(90);
    });

    it('current and previous windows are adjacent and equal width', () => {
      const r = resolvePeriod({ period: '7' }, now);
      expect(r.current.lt).toEqual(now);
      // current.gte === previous.lt (adjacent, no overlap/gap)
      expect(r.current.gte).toEqual(r.previous.lt);
      const curWidth = r.current.lt.getTime() - r.current.gte.getTime();
      const prevWidth = r.previous.lt.getTime() - r.previous.gte.getTime();
      expect(curWidth).toBe(prevWidth);
      expect(curWidth).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('computeTrend', () => {
    it('growth → up with positive pct', () => {
      expect(computeTrend(120, 100)).toEqual({ pct: 20, dir: 'up' });
    });
    it('decline → down with negative pct', () => {
      expect(computeTrend(80, 100)).toEqual({ pct: -20, dir: 'down' });
    });
    it('equal → flat', () => {
      expect(computeTrend(100, 100)).toEqual({ pct: 0, dir: 'flat' });
    });
    it('previous 0 and current > 0 → null pct, up (no div-by-zero)', () => {
      expect(computeTrend(50, 0)).toEqual({ pct: null, dir: 'up' });
    });
    it('both 0 → flat', () => {
      expect(computeTrend(0, 0)).toEqual({ pct: 0, dir: 'flat' });
    });
    it('rounds to one decimal', () => {
      expect(computeTrend(133, 100)).toEqual({ pct: 33, dir: 'up' });
      expect(computeTrend(1015, 1000)).toEqual({ pct: 1.5, dir: 'up' });
    });
  });

  describe('classifyStockTier', () => {
    it('<= 3 critical, else warning', () => {
      expect(classifyStockTier(1)).toBe('critical');
      expect(classifyStockTier(3)).toBe('critical');
      expect(classifyStockTier(4)).toBe('warning');
      expect(classifyStockTier(10)).toBe('warning');
    });
  });

  describe('fillRevenueSeries', () => {
    it('fills missing days with 0, preserves order', () => {
      const dayKeys = [
        { key: '2026-06-12', label: '12.06' },
        { key: '2026-06-13', label: '13.06' },
        { key: '2026-06-14', label: '14.06' },
      ];
      const rows = [
        { day: '2026-06-12', revenue: 500 },
        { day: '2026-06-14', revenue: 900 },
      ];
      expect(fillRevenueSeries(dayKeys, rows)).toEqual([
        { label: '12.06', revenue: 500 },
        { label: '13.06', revenue: 0 },
        { label: '14.06', revenue: 900 },
      ]);
    });
  });
});
