import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { productCardInclude, buildProductCardData } from '@/lib/product-summary';
import { getWishlistProductIds } from '@/lib/wishlist';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD } from '@/constants/config';
import { Hero } from '@/components/shared/home/hero';
import { CategoryBento, type BentoCategory } from '@/components/shared/home/category-bento';
import { BestsellersSection } from '@/components/shared/home/bestsellers-section';
import { DropPromo } from '@/components/shared/home/drop-promo';
import { EngineeredFeature } from '@/components/shared/home/engineered-feature';
import { TrustStrip } from '@/components/shared/home/trust-strip';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };

  const [categories, catCounts, bestRaw] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where: { active: true }, _count: { _all: true } }),
    prisma.product.findMany({ where: { active: true }, take: 4, orderBy: [{ isBestseller: 'desc' }, { createdAt: 'desc' }], include: productCardInclude }),
  ]);

  const countMap = new Map(catCounts.map((c) => [c.categoryId, c._count._all]));
  const bento: BentoCategory[] = categories.map((c) => ({ slug: c.slug, name: c.name, tagline: c.tagline, count: countMap.get(c.id) ?? 0 }));
  const bestsellers = bestRaw.map((p) => buildProductCardData(p, now, cfg));
  const [session, store] = await Promise.all([auth(), cookies()]);
  const wishlistedIds = await getWishlistProductIds(session, store.get(wishlistCookieName)?.value);

  return (
    <>
      <Hero />
      <CategoryBento categories={bento} />
      <BestsellersSection products={bestsellers} wishlistedIds={wishlistedIds} />
      <DropPromo />
      <EngineeredFeature />
      <TrustStrip />
    </>
  );
}
