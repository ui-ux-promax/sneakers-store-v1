import type { Prisma } from '@prisma/client';
import { computeBadges, stockSummary, type ProductBadge } from '@/lib/product-badges';

export const productCardInclude = {
  category: { select: { name: true, slug: true } },
  colorways: {
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }],
    include: {
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
      variants: { select: { price: true, compareAtPrice: true, stock: true, active: true } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductForCard = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryName: string;
  imageUrl: string | null;
  imageAlt: string;
  minPrice: number;
  minCompareAtPrice: number | null;
  badges: ProductBadge[];
  soldOut: boolean;
}

export function buildProductCardData(
  product: ProductForCard,
  now: Date,
  cfg: { newWindowDays: number; lowStock: number },
): ProductCardData {
  const cw = product.colorways[0]; // отсортировано: isDefault desc, sortOrder asc
  const activeVariants = (cw?.variants ?? []).filter((v) => v.active);
  const cheapest = activeVariants.reduce<typeof activeVariants[number] | null>(
    (min, v) => (min === null || v.price < min.price ? v : min),
    null,
  );
  const minPrice = cheapest?.price ?? 0;
  const minCompareAtPrice = cheapest?.compareAtPrice ?? null;
  const stock = stockSummary(cw?.variants ?? [], cfg.lowStock);

  const badges = computeBadges(
    { createdAt: product.createdAt, isBestseller: product.isBestseller, minPrice, minCompareAtPrice, stockTotal: stock.total },
    now,
    cfg,
  );

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    categoryName: product.category.name,
    imageUrl: cw?.images[0]?.url ?? null,
    imageAlt: cw?.images[0]?.alt ?? product.name,
    minPrice,
    minCompareAtPrice,
    badges,
    soldOut: stock.soldOut,
  };
}
