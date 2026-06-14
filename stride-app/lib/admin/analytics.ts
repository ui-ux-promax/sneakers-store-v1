import { LOW_STOCK_THRESHOLD } from '@/constants/config';
import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma-client';
import { ORDER_STATUS_META } from '@/lib/order';
import { ORDER_STATUS_VALUES } from '@/lib/order-admin';

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

// ─────────────────────────── Data layer ───────────────────────────
//
// Каждая функция принимает PrismaClient (по умолчанию общий) + range. Денежные значения —
// целые рубли. CANCELLED исключён из выручки/заказов/units/best-sellers (как метрики 3.5).

type Db = typeof defaultPrisma;

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
