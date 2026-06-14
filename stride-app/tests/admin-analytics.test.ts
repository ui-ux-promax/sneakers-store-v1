import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma-client', () => {
  const prisma = {
    order: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn() },
    productVariant: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return { prisma };
});

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

import { getKpis, getStatusDistribution, getLowStock, getRevenueSeries } from '@/lib/admin/analytics';
import { prisma } from '@/lib/prisma-client';

const p = prisma as unknown as {
  order: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
  productVariant: Record<string, ReturnType<typeof vi.fn>>;
  product: Record<string, ReturnType<typeof vi.fn>>;
  $queryRaw: ReturnType<typeof vi.fn>;
};

const RANGE = resolvePeriod({ period: '30' }, new Date('2026-06-14T12:00:00.000Z'));

describe('getKpis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 2 calls each (current, previous) for revenue/orders/newCustomers; $queryRaw for units.
    p.order.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: 100000 } }) // rev current
      .mockResolvedValueOnce({ _sum: { totalAmount: 80000 } });                // rev previous
    p.order.count.mockResolvedValueOnce(50).mockResolvedValueOnce(40);         // orders cur/prev
    p.user.count.mockResolvedValueOnce(12).mockResolvedValueOnce(10);          // customers cur/prev
    p.$queryRaw.mockResolvedValueOnce([{ units: 200 }]).mockResolvedValueOnce([{ units: 150 }]); // units cur/prev
  });

  it('computes the five KPIs with trends', async () => {
    const k = await getKpis(prisma as never, RANGE);
    expect(k.revenue.value).toBe(100000);
    expect(k.revenue.trend).toEqual({ pct: 25, dir: 'up' });
    expect(k.orders.value).toBe(50);
    expect(k.avgOrder.value).toBe(2000); // round(100000/50)
    expect(k.newCustomers.value).toBe(12);
    expect(k.unitsSold.value).toBe(200);
  });

  it('avgOrder is 0 when there are no orders (no div-by-zero)', async () => {
    vi.resetAllMocks();
    p.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });
    p.order.count.mockResolvedValue(0);
    p.user.count.mockResolvedValue(0);
    p.$queryRaw.mockResolvedValue([{ units: 0 }]);
    const k = await getKpis(prisma as never, RANGE);
    expect(k.avgOrder.value).toBe(0);
  });
});

describe('getStatusDistribution', () => {
  it('maps groupBy rows to labels + total (all-time)', async () => {
    vi.clearAllMocks();
    p.order.groupBy.mockResolvedValue([
      { status: 'DELIVERED', _count: { _all: 6 } },
      { status: 'PENDING', _count: { _all: 2 } },
    ]);
    const d = await getStatusDistribution(prisma as never);
    expect(d.total).toBe(8);
    const delivered = d.segments.find((s) => s.status === 'DELIVERED');
    expect(delivered?.count).toBe(6);
    expect(delivered?.label).toMatch(/достав/i);
  });
});

describe('getLowStock', () => {
  it('classifies tier by stock and shapes rows', async () => {
    vi.clearAllMocks();
    p.productVariant.findMany.mockResolvedValue([
      { id: 'v1', stock: 2, sku: 'A-1', sizeEu: '42', colorway: { name: 'Black', product: { name: 'Urban Flow' } } },
      { id: 'v2', stock: 7, sku: 'B-2', sizeEu: '38', colorway: { name: 'White', product: { name: 'Cloud' } } },
    ]);
    const rows = await getLowStock(prisma as never);
    expect(rows[0]).toMatchObject({ id: 'v1', tier: 'critical', productName: 'Urban Flow', stock: 2 });
    expect(rows[1]).toMatchObject({ id: 'v2', tier: 'warning', productName: 'Cloud', stock: 7 });
  });
});

describe('getRevenueSeries', () => {
  it('returns a full daily series with zero-filled gaps, no lost or invented revenue', async () => {
    vi.clearAllMocks();
    const range = resolvePeriod({ period: '7' }, new Date('2026-06-14T12:00:00.000Z'));
    // SQL returns one in-range day; every other day must be zero-filled.
    p.$queryRaw.mockResolvedValue([{ day: '2026-06-10', revenue: 1234 }]);
    const series = await getRevenueSeries(prisma as never, range);

    // 7 full days [gte .. lt-1d] + the partial lt day → at least 7 entries.
    expect(series.length).toBeGreaterThanOrEqual(7);
    for (const point of series) {
      expect(typeof point.label).toBe('string');
      expect(typeof point.revenue).toBe('number');
    }
    // Zero-fill must neither lose nor invent revenue. 2026-06-10 is mid-window → its
    // key is generated, so the single mocked row is the entire series total.
    const total = series.reduce((sum, point) => sum + point.revenue, 0);
    expect(total).toBe(1234);
    expect(series.filter((point) => point.revenue !== 0)).toHaveLength(1);
  });
});
