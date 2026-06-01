export type BadgeTone = 'new' | 'bestseller' | 'discount' | 'limited' | 'soldout';
export interface ProductBadge { tone: BadgeTone; label: string; }

export function isNewByDate(createdAt: Date, now: Date, windowDays: number): boolean {
  const ms = windowDays * 24 * 60 * 60 * 1000;
  return now.getTime() - createdAt.getTime() <= ms;
}

export function discountPercent(price: number, compareAtPrice: number | null | undefined): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round((1 - price / compareAtPrice) * 100);
}

export interface VariantStock { stock: number; active: boolean; }
export interface StockSummary { total: number; soldOut: boolean; low: boolean; }

export function stockSummary(variants: VariantStock[], lowThreshold = 3): StockSummary {
  const total = variants.filter((v) => v.active).reduce((acc, v) => acc + Math.max(0, v.stock), 0);
  return { total, soldOut: total === 0, low: total > 0 && total <= lowThreshold };
}

export interface BadgeInput {
  createdAt: Date;
  isBestseller: boolean;
  minPrice: number;
  minCompareAtPrice: number | null;
  stockTotal: number;
}

export function computeBadges(
  input: BadgeInput,
  now: Date,
  opts: { newWindowDays: number; lowStock: number },
): ProductBadge[] {
  if (input.stockTotal === 0) return [{ tone: 'soldout', label: 'Распродано' }];

  const badges: ProductBadge[] = [];
  const pct = discountPercent(input.minPrice, input.minCompareAtPrice);
  if (pct !== null) badges.push({ tone: 'discount', label: `-${pct}%` });
  if (isNewByDate(input.createdAt, now, opts.newWindowDays)) badges.push({ tone: 'new', label: 'Новинка' });
  if (input.isBestseller) badges.push({ tone: 'bestseller', label: 'Бестселлер' });
  return badges;
}
