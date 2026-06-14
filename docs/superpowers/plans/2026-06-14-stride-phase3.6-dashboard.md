# Phase 3.6 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/admin` dashboard stub with a live analytics dashboard — 5 period-aware KPIs with trends, a revenue-by-day area chart, an order-status donut, top sellers by revenue, low-stock alerts, and recent orders.

**Architecture:** A single analytics module (`lib/admin/analytics.ts`) holds pure helpers (period resolution, trend math, stock-tier classification, day-series fill) plus async data functions that read via Prisma — `aggregate`/`count`/`groupBy`/`findMany` where Prisma suffices, `$queryRaw` for daily revenue buckets and best-sellers-by-revenue (3-level JOIN). The RSC page resolves the period from `?period=`, fans out the data functions in `Promise.all`, and passes results to presentational components. Only the two chart widgets are client islands (Recharts); everything else is RSC. **Schema is read-only — untouched.**

**Tech Stack:** Next.js 15 App Router (RSC), Prisma 6.19 + Neon WebSocket adapter, Recharts (new dep), vitest (node-only), Tailwind admin tokens, Material Symbols.

**Spec:** `docs/superpowers/specs/2026-06-14-stride-phase3.6-dashboard-design.md`

**Conventions:**
- All `npm`/`npx` commands run from `stride-app/`.
- Tests node-only vitest. Single file: `npx vitest run tests/<file>.test.ts`. Typecheck: `npx tsc --noEmit`.
- Commit messages English, no `Co-Authored-By`.
- Do NOT run `prisma db push`/`seed`/e2e/`next build` locally (Neon hangs on Windows). `tsc` + `vitest` are safe.
- Money is integer rubles; render with `formatPrice` from `@/lib/format`. Dates via `formatDateTime`/`formatDate` (MSK).

**Files created/modified:**
- Modify `stride-app/package.json` — add `recharts`.
- Create `stride-app/lib/admin/analytics.ts` — pure helpers + async data functions.
- Create `stride-app/app/(admin)/admin/_components/period-toggle.tsx` — client, 7/30/90 pill.
- Create `stride-app/app/(admin)/admin/_components/kpi-card.tsx` — server KPI card.
- Create `stride-app/app/(admin)/admin/_components/revenue-chart.tsx` — client, Recharts area chart.
- Create `stride-app/app/(admin)/admin/_components/status-donut.tsx` — client, Recharts donut.
- Create `stride-app/app/(admin)/admin/_components/best-sellers.tsx` — server.
- Create `stride-app/app/(admin)/admin/_components/low-stock.tsx` — server.
- Create `stride-app/app/(admin)/admin/_components/recent-orders.tsx` — server.
- Modify `stride-app/app/(admin)/admin/page.tsx` — replace stub with dashboard RSC.
- Create tests: `tests/admin-analytics.test.ts`.
- Sidebar nav already has Dashboard (`admin-shell.tsx`) — **no change**.

---

## Task 1: Add the Recharts dependency

**Files:**
- Modify: `stride-app/package.json` (+ `package-lock.json`)

- [ ] **Step 1: Install recharts**

Run: `cd stride-app && npm install recharts@^2.13.0`
Expected: `recharts` added to `dependencies`, lockfile updated, no peer-dep errors (React 18.3 is compatible).

- [ ] **Step 2: Verify it resolves**

Run: `cd stride-app && node -e "require.resolve('recharts'); console.log('recharts OK')"`
Expected: prints `recharts OK`.

- [ ] **Step 3: Commit**

```bash
git add stride-app/package.json stride-app/package-lock.json
git commit -m "build(dashboard): add recharts dependency"
```

---

## Task 2: Analytics pure core — `lib/admin/analytics.ts`

**Files:**
- Create: `stride-app/lib/admin/analytics.ts`
- Test: `stride-app/tests/admin-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stride-app/tests/admin-analytics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd stride-app && npx vitest run tests/admin-analytics.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/analytics'`.

- [ ] **Step 3: Write the pure core**

Create `stride-app/lib/admin/analytics.ts`:

```ts
import { LOW_STOCK_THRESHOLD } from '@/constants/config';

// ─────────────────────────── Period ───────────────────────────

export const PERIOD_VALUES = [7, 30, 90] as const;
export type Period = (typeof PERIOD_VALUES)[number];
export const DEFAULT_PERIOD: Period = 30;

export type DateRange = { gte: Date; lt: Date };
export type ResolvedPeriod = { days: Period; current: DateRange; previous: DateRange };

const DAY_MS = 24 * 60 * 60 * 1000;

// Парс ?period= (валид → 7/30/90, иначе 30). current = [now−N, now); previous = [now−2N, now−N).
// now инъектируется параметром (чистая функция, тестируемость без Date.now()).
export function resolvePeriod(
  sp: Record<string, string | string[] | undefined>,
  now: Date,
): ResolvedPeriod {
  const rawValue = typeof sp.period === 'string' ? Number(sp.period) : NaN;
  const days = (PERIOD_VALUES as readonly number[]).includes(rawValue)
    ? (rawValue as Period)
    : DEFAULT_PERIOD;
  const ms = days * DAY_MS;
  const currentGte = new Date(now.getTime() - ms);
  const previousGte = new Date(now.getTime() - 2 * ms);
  return {
    days,
    current: { gte: currentGte, lt: now },
    previous: { gte: previousGte, lt: currentGte },
  };
}

// ─────────────────────────── Trend ───────────────────────────

export type Trend = { pct: number | null; dir: 'up' | 'down' | 'flat' };

// pct округлён до 1 знака. previous=0 && current>0 → {null,'up'} («новое», без деления на 0).
export function computeTrend(current: number, previous: number): Trend {
  if (previous === 0) {
    return current > 0 ? { pct: null, dir: 'up' } : { pct: 0, dir: 'flat' };
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct > 0) return { pct, dir: 'up' };
  if (pct < 0) return { pct, dir: 'down' };
  return { pct: 0, dir: 'flat' };
}

// ─────────────────────────── Stock tier ───────────────────────────

export function classifyStockTier(stock: number): 'critical' | 'warning' {
  return stock <= LOW_STOCK_THRESHOLD ? 'critical' : 'warning';
}

// ─────────────────────────── Revenue series fill ───────────────────────────

// Полный дневной ряд: для каждого ожидаемого дня берём revenue из rows или 0. dayKeys
// предпосчитаны вызывающим (с tz-форматированием) — здесь чистое сопоставление по ключу дня.
export function fillRevenueSeries(
  dayKeys: { key: string; label: string }[],
  rows: { day: string; revenue: number }[],
): { label: string; revenue: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.revenue]));
  return dayKeys.map(({ key, label }) => ({ label, revenue: byDay.get(key) ?? 0 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd stride-app && npx vitest run tests/admin-analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stride-app/lib/admin/analytics.ts stride-app/tests/admin-analytics.test.ts
git commit -m "feat(dashboard): analytics pure core (period, trend, stock tier, series fill)"
```

---

## Task 3: Analytics data functions — append to `lib/admin/analytics.ts`

**Files:**
- Modify: `stride-app/lib/admin/analytics.ts`
- Test: `stride-app/tests/admin-analytics.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `stride-app/tests/admin-analytics.test.ts` (new top-level `describe` blocks + a prisma mock). Add this mock block and imports at the TOP of the file, above the existing first `describe` (merge the vitest import — add `vi, beforeEach`):

```ts
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
```

Then append these `describe` blocks at the END of the file:

```ts
import { getKpis, getStatusDistribution, getLowStock } from '@/lib/admin/analytics';
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
    vi.clearAllMocks();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd stride-app && npx vitest run tests/admin-analytics.test.ts`
Expected: FAIL — `getKpis`/`getStatusDistribution`/`getLowStock` not exported.

- [ ] **Step 3: Append the data functions**

Append to `stride-app/lib/admin/analytics.ts` (add the imports at the top of the file, below the existing `LOW_STOCK_THRESHOLD` import):

```ts
import { Prisma, type OrderStatus, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma-client';
import { ORDER_STATUS_META } from '@/lib/order';
import { ORDER_STATUS_VALUES } from '@/lib/order-admin';
```

Then append the data layer at the END of the file:

```ts
// ─────────────────────────── Data layer ───────────────────────────
//
// Каждая функция принимает PrismaClient (по умолчанию общий) + range. Денежные значения —
// целые рубли. CANCELLED исключён из выручки/заказов/units/best-sellers (как метрики 3.5).

type Db = PrismaClient;

export type Kpi = { value: number; trend: Trend };
export type DashboardKpis = {
  revenue: Kpi;
  orders: Kpi;
  avgOrder: Kpi;
  newCustomers: Kpi;
  unitsSold: Kpi;
};

const notCancelled = { not: 'CANCELLED' as OrderStatus };

async function sumRevenue(db: Db, r: DateRange): Promise<number> {
  const agg = await db.order.aggregate({
    _sum: { totalAmount: true },
    where: { status: notCancelled, createdAt: { gte: r.gte, lt: r.lt } },
  });
  return agg._sum.totalAmount ?? 0;
}

async function countOrders(db: Db, r: DateRange): Promise<number> {
  return db.order.count({
    where: { status: notCancelled, createdAt: { gte: r.gte, lt: r.lt } },
  });
}

async function countNewCustomers(db: Db, r: DateRange): Promise<number> {
  return db.user.count({
    where: { role: 'CUSTOMER', createdAt: { gte: r.gte, lt: r.lt } },
  });
}

async function sumUnits(db: Db, r: DateRange): Promise<number> {
  const rows = await db.$queryRaw<{ units: number }[]>(Prisma.sql`
    SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE o.status::text <> 'CANCELLED'
      AND o."createdAt" >= ${r.gte} AND o."createdAt" < ${r.lt}
  `);
  return rows[0]?.units ?? 0;
}

export async function getKpis(db: Db = defaultPrisma, range: ResolvedPeriod): Promise<DashboardKpis> {
  const [revCur, revPrev, ordCur, ordPrev, custCur, custPrev, unitsCur, unitsPrev] =
    await Promise.all([
      sumRevenue(db, range.current),
      sumRevenue(db, range.previous),
      countOrders(db, range.current),
      countOrders(db, range.previous),
      countNewCustomers(db, range.current),
      countNewCustomers(db, range.previous),
      sumUnits(db, range.current),
      sumUnits(db, range.previous),
    ]);

  const avgCur = ordCur > 0 ? Math.round(revCur / ordCur) : 0;
  const avgPrev = ordPrev > 0 ? Math.round(revPrev / ordPrev) : 0;

  return {
    revenue: { value: revCur, trend: computeTrend(revCur, revPrev) },
    orders: { value: ordCur, trend: computeTrend(ordCur, ordPrev) },
    avgOrder: { value: avgCur, trend: computeTrend(avgCur, avgPrev) },
    newCustomers: { value: custCur, trend: computeTrend(custCur, custPrev) },
    unitsSold: { value: unitsCur, trend: computeTrend(unitsCur, unitsPrev) },
  };
}

// ── Status donut (all-time) ──

export type StatusSegment = { status: OrderStatus; label: string; count: number };
export type StatusDistribution = { segments: StatusSegment[]; total: number };

export async function getStatusDistribution(db: Db = defaultPrisma): Promise<StatusDistribution> {
  const groups = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = new Map<OrderStatus, number>();
  for (const g of groups) counts.set(g.status, g._count._all);
  const segments: StatusSegment[] = ORDER_STATUS_VALUES.map((status) => ({
    status,
    label: ORDER_STATUS_META[status].label,
    count: counts.get(status) ?? 0,
  })).filter((s) => s.count > 0);
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return { segments, total };
}

// ── Revenue series (period, daily buckets in MSK) ──

const MSK_DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}); // YYYY-MM-DD
const MSK_DAY_LABEL = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
}); // dd.mm

export async function getRevenueSeries(
  db: Db = defaultPrisma,
  range: ResolvedPeriod,
): Promise<{ label: string; revenue: number }[]> {
  const rows = await db.$queryRaw<{ day: string; revenue: number }[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', o."createdAt" AT TIME ZONE 'Europe/Moscow'), 'YYYY-MM-DD') AS day,
           SUM(o."totalAmount")::int AS revenue
    FROM "Order" o
    WHERE o.status::text <> 'CANCELLED'
      AND o."createdAt" >= ${range.current.gte} AND o."createdAt" < ${range.current.lt}
    GROUP BY day
  `);

  // Полный ряд дней current-окна (по МСК-суткам), пустые → 0.
  const dayKeys: { key: string; label: string }[] = [];
  for (let t = range.current.gte.getTime(); t < range.current.lt.getTime(); t += DAY_MS) {
    const d = new Date(t);
    dayKeys.push({ key: MSK_DAY_KEY.format(d), label: MSK_DAY_LABEL.format(d) });
  }
  return fillRevenueSeries(dayKeys, rows);
}

// ── Best sellers by revenue (period) ──

export type BestSeller = {
  productId: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
};

export async function getBestSellers(
  db: Db = defaultPrisma,
  range: ResolvedPeriod,
): Promise<BestSeller[]> {
  const rows = await db.$queryRaw<
    { product_id: string; name: string; brand: string; units: number; revenue: number }[]
  >(Prisma.sql`
    SELECT p.id AS product_id, p.name, p.brand,
           SUM(oi.quantity)::int AS units,
           SUM(oi."lineTotal")::int AS revenue
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "ProductVariant" pv ON pv.id = oi."productVariantId"
    JOIN "ProductColorway" pc ON pc.id = pv."colorwayId"
    JOIN "Product" p ON p.id = pc."productId"
    WHERE o.status::text <> 'CANCELLED'
      AND o."createdAt" >= ${range.current.gte} AND o."createdAt" < ${range.current.lt}
    GROUP BY p.id, p.name, p.brand
    ORDER BY revenue DESC
    LIMIT 5
  `);

  if (rows.length === 0) return [];

  // Фото — добивка через default-colorway первой картинкой.
  const products = await db.product.findMany({
    where: { id: { in: rows.map((r) => r.product_id) } },
    select: {
      id: true,
      colorways: {
        where: { isDefault: true },
        take: 1,
        select: { images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } } },
      },
    },
  });
  const imageByProduct = new Map<string, string | null>();
  for (const prod of products) {
    imageByProduct.set(prod.id, prod.colorways[0]?.images[0]?.url ?? null);
  }

  return rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    brand: r.brand,
    imageUrl: imageByProduct.get(r.product_id) ?? null,
    units: r.units,
    revenue: r.revenue,
  }));
}

// ── Low stock (current state) ──

export type LowStockRow = {
  id: string;
  productName: string;
  colorwayName: string;
  sizeEu: string;
  sku: string;
  stock: number;
  tier: 'critical' | 'warning';
};

export async function getLowStock(db: Db = defaultPrisma): Promise<LowStockRow[]> {
  const variants = await db.productVariant.findMany({
    where: { active: true, stock: { gt: 0, lte: 10 } },
    orderBy: { stock: 'asc' },
    take: 12,
    select: {
      id: true,
      stock: true,
      sku: true,
      sizeEu: true,
      colorway: { select: { name: true, product: { select: { name: true } } } },
    },
  });
  return variants.map((v) => ({
    id: v.id,
    productName: v.colorway.product.name,
    colorwayName: v.colorway.name,
    sizeEu: String(v.sizeEu),
    sku: v.sku,
    stock: v.stock,
    tier: classifyStockTier(v.stock),
  }));
}

// ── Recent orders (current state) ──

export type RecentOrderRow = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  paymentStatus: string | null;
  totalAmount: number;
  createdAt: Date;
  contactName: string;
  email: string | null;
};

export async function getRecentOrders(db: Db = defaultPrisma): Promise<RecentOrderRow[]> {
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      createdAt: true,
      contactName: true,
      payment: { select: { status: true } },
      user: { select: { email: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.payment?.status ?? null,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt,
    contactName: o.contactName,
    email: o.user?.email ?? null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd stride-app && npx vitest run tests/admin-analytics.test.ts`
Expected: PASS (pure core + getKpis + getStatusDistribution + getLowStock cases green).

- [ ] **Step 5: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS. Watch: `Prisma` is a value import (for `Prisma.sql`); `OrderStatus`/`PrismaClient` are type imports.

- [ ] **Step 6: Commit**

```bash
git add stride-app/lib/admin/analytics.ts stride-app/tests/admin-analytics.test.ts
git commit -m "feat(dashboard): analytics data functions (kpis, series, donut, best-sellers, low-stock, recent)"
```

---

## Task 4: Period toggle — `_components/period-toggle.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/_components/period-toggle.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/_components/period-toggle.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PERIOD_VALUES, DEFAULT_PERIOD } from '@/lib/admin/analytics';

const LABELS: Record<number, string> = { 7: '7 дней', 30: '30 дней', 90: '90 дней' };

export function PeriodToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = Number(params.get('period'));
  const active = (PERIOD_VALUES as readonly number[]).includes(raw) ? raw : DEFAULT_PERIOD;

  function setPeriod(value: number) {
    const next = new URLSearchParams(params.toString());
    if (value === DEFAULT_PERIOD) next.delete('period');
    else next.set('period', String(value));
    router.push(`/admin?${next.toString()}`);
  }

  return (
    <div className="flex bg-admin-surface rounded-full p-1 border border-admin-outline-variant">
      {PERIOD_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setPeriod(value)}
          className={cn(
            'px-4 py-1.5 text-sm font-bold rounded-full transition-colors',
            value === active
              ? 'bg-admin-primary text-admin-on-primary'
              : 'text-admin-on-surface-variant hover:text-admin-on-surface',
          )}
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/_components/period-toggle.tsx"
git commit -m "feat(dashboard): period toggle (7/30/90 days)"
```

---

## Task 5: KPI card — `_components/kpi-card.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/_components/kpi-card.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/_components/kpi-card.tsx`:

```tsx
import { Icon } from '@/components/admin/icon';
import { cn } from '@/lib/utils';
import type { Trend } from '@/lib/admin/analytics';

// value — уже отформатированная строка (₽ через formatPrice или число штук). trend — из computeTrend.
export function KpiCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  trend: Trend;
}) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6 hover:border-admin-primary transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-admin-surface-high flex items-center justify-center group-hover:bg-admin-primary transition-colors">
          <Icon name={icon} className="text-admin-on-surface group-hover:text-admin-on-primary" />
        </div>
        <TrendBadge trend={trend} />
      </div>
      <p className="text-xs text-admin-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
      <h3 className="font-admin-head text-2xl font-bold text-admin-on-surface tabular-nums">{value}</h3>
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.pct === null) {
    return <span className="text-xs font-bold text-admin-on-surface-variant">новое</span>;
  }
  if (trend.dir === 'flat') {
    return <span className="text-xs font-bold text-admin-on-surface-variant">—</span>;
  }
  const up = trend.dir === 'up';
  return (
    <span className={cn('text-xs font-bold inline-flex items-center gap-0.5', up ? 'text-admin-on-surface' : 'text-admin-error')}>
      <Icon name={up ? 'trending_up' : 'trending_down'} className="text-[16px]" />
      {up ? '+' : ''}{trend.pct}%
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/_components/kpi-card.tsx"
git commit -m "feat(dashboard): KPI card with trend badge"
```

---

## Task 6: Revenue chart — `_components/revenue-chart.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/_components/revenue-chart.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/_components/revenue-chart.tsx`:

```tsx
'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPrice } from '@/lib/format';

export function RevenueChart({ data }: { data: { label: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--admin-primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--admin-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--admin-outline-variant)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--admin-on-surface-variant)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: 'var(--admin-on-surface-variant)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          formatter={(value: number) => [formatPrice(value), 'Выручка']}
          contentStyle={{
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-outline-variant)',
            borderRadius: 12,
            color: 'var(--admin-on-surface)',
          }}
          labelStyle={{ color: 'var(--admin-on-surface-variant)' }}
        />
        <Area type="monotone" dataKey="revenue" stroke="var(--admin-primary)" strokeWidth={3} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS (recharts types resolve — installed in Task 1).

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/_components/revenue-chart.tsx"
git commit -m "feat(dashboard): revenue area chart (recharts)"
```

---

## Task 7: Status donut — `_components/status-donut.tsx`

**Files:**
- Create: `stride-app/app/(admin)/admin/_components/status-donut.tsx`

- [ ] **Step 1: Write the component**

Create `stride-app/app/(admin)/admin/_components/status-donut.tsx`:

```tsx
'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { OrderStatus } from '@prisma/client';
import type { StatusSegment } from '@/lib/admin/analytics';

// Палитра donut по статусам — яркие тона, различимы в обеих темах.
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#3b82f6',
  PROCESSING: '#f59e0b',
  SHIPPED: '#8b5cf6',
  DELIVERED: '#b2f700',
  CANCELLED: '#ef4444',
};

export function StatusDonut({ segments, total }: { segments: StatusSegment[]; total: number }) {
  if (total === 0) {
    return <p className="text-sm text-admin-on-surface-variant">Заказов пока нет.</p>;
  }
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="count"
              nameKey="label"
              innerRadius={64}
              outerRadius={90}
              paddingAngle={2}
              strokeWidth={0}
            >
              {segments.map((s) => (
                <Cell key={s.status} fill={STATUS_COLOR[s.status]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-admin-head text-2xl font-bold text-admin-on-surface tabular-nums">{total}</span>
          <span className="text-xs text-admin-on-surface-variant">Всего</span>
        </div>
      </div>
      <div className="w-full space-y-2 mt-6">
        {segments.map((s) => (
          <div key={s.status} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLOR[s.status] }} />
              <span className="text-admin-on-surface-variant">{s.label}</span>
            </div>
            <span className="font-bold text-admin-on-surface tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/_components/status-donut.tsx"
git commit -m "feat(dashboard): order status donut (recharts)"
```

---

## Task 8: Server widgets — best-sellers, low-stock, recent-orders

**Files:**
- Create: `stride-app/app/(admin)/admin/_components/best-sellers.tsx`
- Create: `stride-app/app/(admin)/admin/_components/low-stock.tsx`
- Create: `stride-app/app/(admin)/admin/_components/recent-orders.tsx`

- [ ] **Step 1: Write best-sellers.tsx**

Create `stride-app/app/(admin)/admin/_components/best-sellers.tsx`:

```tsx
import { Icon } from '@/components/admin/icon';
import { formatPrice } from '@/lib/format';
import type { BestSeller } from '@/lib/admin/analytics';

export function BestSellers({ items }: { items: BestSeller[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Топ продаж за период</h3>
      {items.length === 0 ? (
        <p className="text-sm text-admin-on-surface-variant">Продаж за период нет.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-4 p-3 rounded-xl bg-admin-surface-low border border-admin-outline-variant"
            >
              <div className="w-14 h-14 bg-white rounded-lg p-1 border border-admin-outline-variant flex items-center justify-center shrink-0 overflow-hidden">
                {item.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- admin thumb */
                  <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                ) : (
                  <Icon name="image" className="text-admin-on-surface-variant" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-admin-on-surface truncate">{item.name}</p>
                <p className="text-xs text-admin-on-surface-variant">{item.brand}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-admin-on-surface tabular-nums">{formatPrice(item.revenue)}</p>
                <p className="text-xs text-admin-on-surface-variant tabular-nums">{item.units} шт.</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write low-stock.tsx**

Create `stride-app/app/(admin)/admin/_components/low-stock.tsx`:

```tsx
import { cn } from '@/lib/utils';
import type { LowStockRow } from '@/lib/admin/analytics';

export function LowStock({ rows }: { rows: LowStockRow[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-admin-head text-lg font-bold text-admin-on-surface">Низкий сток</h3>
        {rows.length > 0 && (
          <span className="px-3 py-1 bg-admin-error text-admin-on-error rounded-full font-bold text-xs">
            {rows.length} поз.
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-admin-on-surface-variant">Сток в норме.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => {
            const critical = row.tier === 'critical';
            return (
              <div
                key={row.id}
                className={cn(
                  'p-3 rounded-xl border flex justify-between items-center gap-2',
                  critical
                    ? 'border-admin-error bg-admin-error/10'
                    : 'border-admin-secondary-container bg-admin-secondary-container/30',
                )}
              >
                <div className="min-w-0">
                  <p className="font-bold text-admin-on-surface truncate">{row.productName}</p>
                  <p className="text-xs text-admin-on-surface-variant truncate">
                    EU {row.sizeEu} · {row.sku}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('font-admin-head text-xl font-bold tabular-nums', critical ? 'text-admin-error' : 'text-admin-on-surface')}>
                    {row.stock}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-admin-on-surface-variant">в наличии</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write recent-orders.tsx**

Create `stride-app/app/(admin)/admin/_components/recent-orders.tsx`:

```tsx
import Link from 'next/link';
import { formatPrice, formatDateTime } from '@/lib/format';
import { orderStatusView } from '@/lib/order';
import type { RecentOrderRow } from '@/lib/admin/analytics';

export function RecentOrders({ rows }: { rows: RecentOrderRow[] }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
      <div className="p-6 pb-3">
        <h3 className="font-admin-head text-lg font-bold text-admin-on-surface">Последние заказы</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-admin-on-surface-variant">Заказов нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-surface-high border-y border-admin-outline-variant">
              <tr>
                {['Заказ', 'Клиент', 'Статус', 'Сумма'].map((h) => (
                  <th key={h} className="px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-admin-on-surface-variant">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-outline-variant">
              {rows.map((row) => {
                const sv = orderStatusView(row.status, row.paymentStatus);
                return (
                  <tr key={row.id} className="hover:bg-admin-surface-high transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/admin/orders/${row.id}`} className="font-bold text-admin-on-surface hover:underline tabular-nums">
                        #{row.orderNumber}
                      </Link>
                      <div className="text-[11px] text-admin-on-surface-variant tabular-nums">{formatDateTime(row.createdAt)}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-admin-on-surface truncate max-w-[160px]">{row.contactName}</div>
                      {row.email && <div className="text-[11px] text-admin-on-surface-variant truncate max-w-[160px]">{row.email}</div>}
                    </td>
                    <td className="px-6 py-3"><span className={sv.badge}>{sv.label}</span></td>
                    <td className="px-6 py-3 font-bold text-admin-on-surface tabular-nums">{formatPrice(row.totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "stride-app/app/(admin)/admin/_components/best-sellers.tsx" "stride-app/app/(admin)/admin/_components/low-stock.tsx" "stride-app/app/(admin)/admin/_components/recent-orders.tsx"
git commit -m "feat(dashboard): best-sellers, low-stock, recent-orders server widgets"
```

---

## Task 9: Dashboard page — `page.tsx`

**Files:**
- Modify (replace stub): `stride-app/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Replace the stub**

Overwrite `stride-app/app/(admin)/admin/page.tsx`:

```tsx
import { prisma } from '@/lib/prisma-client';
import { formatPrice } from '@/lib/format';
import {
  resolvePeriod,
  getKpis,
  getRevenueSeries,
  getStatusDistribution,
  getBestSellers,
  getLowStock,
  getRecentOrders,
} from '@/lib/admin/analytics';
import { PeriodToggle } from './_components/period-toggle';
import { KpiCard } from './_components/kpi-card';
import { RevenueChart } from './_components/revenue-chart';
import { StatusDonut } from './_components/status-donut';
import { BestSellers } from './_components/best-sellers';
import { LowStock } from './_components/low-stock';
import { RecentOrders } from './_components/recent-orders';

export const metadata = { title: 'Дашборд' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = resolvePeriod(sp, new Date());

  const [kpis, revenueSeries, statusDist, bestSellers, lowStock, recentOrders] = await Promise.all([
    getKpis(prisma, range),
    getRevenueSeries(prisma, range),
    getStatusDistribution(prisma),
    getBestSellers(prisma, range),
    getLowStock(prisma),
    getRecentOrders(prisma),
  ]);

  return (
    <div className="space-y-8">
      {/* Шапка */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Performance Hub</h2>
          <p className="text-admin-on-surface-variant">Метрики магазина STRIDE за выбранный период</p>
        </div>
        <PeriodToggle />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <KpiCard icon="payments" label="Выручка" value={formatPrice(kpis.revenue.value)} trend={kpis.revenue.trend} />
        <KpiCard icon="shopping_bag" label="Заказы" value={String(kpis.orders.value)} trend={kpis.orders.trend} />
        <KpiCard icon="analytics" label="Средний чек" value={formatPrice(kpis.avgOrder.value)} trend={kpis.avgOrder.trend} />
        <KpiCard icon="person_add" label="Новые клиенты" value={String(kpis.newCustomers.value)} trend={kpis.newCustomers.trend} />
        <KpiCard icon="inventory" label="Продано пар" value={String(kpis.unitsSold.value)} trend={kpis.unitsSold.trend} />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8 bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
          <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Выручка по дням</h3>
          <RevenueChart data={revenueSeries} />
        </div>
        <div className="col-span-12 xl:col-span-4 bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
          <h3 className="font-admin-head text-lg font-bold text-admin-on-surface mb-4">Статусы заказов</h3>
          <StatusDonut segments={statusDist.segments} total={statusDist.total} />
        </div>
      </div>

      {/* Нижний ряд */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5">
          <BestSellers items={bestSellers} />
        </div>
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <LowStock rows={lowStock} />
          <RecentOrders rows={recentOrders} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS. Note: `getKpis(prisma, range)` — the `db` param accepts the real `prisma` client.

- [ ] **Step 3: Commit**

```bash
git add "stride-app/app/(admin)/admin/page.tsx"
git commit -m "feat(dashboard): assemble performance hub page"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole app**

Run: `cd stride-app && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 2: Run the full test suite**

Run: `cd stride-app && npx vitest run`
Expected: PASS — all prior tests + the new `admin-analytics` cases green.

- [ ] **Step 3: Confirm schema untouched**

Run: `git diff --stat origin/main -- stride-app/prisma/schema.prisma`
Expected: NO output. If anything appears, revert it.

- [ ] **Step 4: Confirm working tree clean**

Run: `git status --short`
Expected: clean (everything committed per task; ignore pre-existing untracked `AGENTS.md` / `prisma/gen-seed-sql.ts` if present).

- [ ] **Step 5: Manual preview verification (post-push)**

After pushing + opening a PR, on the Vercel preview verify:
- `/admin` renders all widgets; period toggle (7/30/90) reloads with new numbers; default is 30.
- KPIs show ₽ for revenue/avg, integers for orders/customers/units; trend arrows up (lime/neutral) / down (red) / «новое» when previous window empty.
- Revenue area chart renders with daily points; tooltip shows ₽; theme tokens resolve (lime line) in both light + dark.
- Donut renders 5-status palette + center total + legend; empty-state if no orders.
- Best sellers list (top 5 by revenue, ₽ + units) or empty-state.
- Low stock: critical (red, ≤3) vs warning (violet, 4–10) tiers; «N поз.» badge; empty-state «Сток в норме».
- Recent orders: 10 rows, #number links to `/admin/orders/[id]`, status badges, ₽ amounts.

---

## Self-Review (run by plan author)

**1. Spec coverage:**
- §3.1 Recharts charts → Tasks 6, 7. ✓
- §3.2 five real KPIs (no Conv.Rate) → Task 3 `getKpis` + Task 5 `KpiCard` + Task 9 (5 cards). ✓
- §3.3 period toggle 7/30/90 + real trends (current vs previous) → Task 2 `resolvePeriod`/`computeTrend`, Task 4 toggle. ✓
- §3.4 best sellers by revenue (raw JOIN) → Task 3 `getBestSellers`. ✓
- §3.5 schema untouched → no schema task; Task 10 step 3 guards it. ✓
- §4.2 analytics module: pure helpers (Task 2) + data funcs (Task 3); raw for units/revenue-series/best-sellers, Prisma for the rest. ✓
- §4.2 donut all-time → `getStatusDistribution` (no range param). ✓
- §4.2 low-stock tiers critical≤3/warning≤10 → `classifyStockTier` + `getLowStock` (range gt:0, lte:10). ✓
- §4.2 revenue daily buckets MSK + zero-fill → `getRevenueSeries` + `fillRevenueSeries`. ✓
- §4.2 CANCELLED excluded from revenue/orders/units/best-sellers → `notCancelled` filter + raw `status::text <> 'CANCELLED'`. ✓
- §4.3 page Promise.all + layout → Task 9. ✓
- §4.4 client islands (PeriodToggle, RevenueChart, StatusDonut) → Tasks 4, 6, 7. ✓
- §4.5 server widgets (KpiCard, BestSellers, LowStock, RecentOrders) → Tasks 5, 8. ✓
- §5 recharts dep → Task 1. ✓
- §6 tests (computeTrend, resolvePeriod, classifyStockTier, fillRevenueSeries, getKpis shape+avg=0, getLowStock tier, getStatusDistribution) → Tasks 2, 3. ✓

**2. Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". Every code step complete. ✓

**3. Type consistency:**
- `Trend` defined Task 2, used Task 3 (`computeTrend` return), Task 5 (`KpiCard` prop). ✓
- `ResolvedPeriod`/`DateRange` Task 2 → consumed Task 3 data funcs + Task 9. ✓
- `DashboardKpis`/`Kpi` Task 3 → Task 9 maps `.value`/`.trend`. ✓
- `StatusSegment`/`StatusDistribution` Task 3 → Task 7 `StatusDonut` (`segments`, `total`) + Task 9. ✓
- `BestSeller` Task 3 → Task 8 `BestSellers` (`items`). ✓
- `LowStockRow` Task 3 → Task 8 `LowStock` (`rows`, `.tier`/`.stock`/`.productName`/`.sizeEu`/`.sku`). ✓
- `RecentOrderRow` Task 3 → Task 8 `RecentOrders` (`rows`, `.status`/`.paymentStatus`/`.orderNumber`). ✓
- `getKpis(db, range)` signature consistent: Task 3 def, test call `getKpis(prisma as never, RANGE)`, Task 9 `getKpis(prisma, range)`. ✓
- `PERIOD_VALUES`/`DEFAULT_PERIOD` Task 2 → Task 4 toggle. ✓
- Data funcs default `db = defaultPrisma` but page passes `prisma` explicitly — both valid. ✓
```
