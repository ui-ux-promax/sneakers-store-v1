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
