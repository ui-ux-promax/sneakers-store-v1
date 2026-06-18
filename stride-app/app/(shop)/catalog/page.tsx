import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { findProducts } from '@/lib/find-products';
import { catalogSeoDescription, defaultOgImage } from '@/lib/seo';
import { getWishlistProductIds } from '@/lib/wishlist';
import { wishlistCookieName } from '@/lib/wishlist-cookie';
import { ProductCard } from '@/components/shared/product-card';
import { FilterSidebar } from '@/components/shared/catalog/filter-sidebar';
import { MobileFilterDrawer } from '@/components/shared/catalog/mobile-filter-drawer';
import { SortSelect } from '@/components/shared/catalog/sort-select';
import { ActiveFilterChips } from '@/components/shared/catalog/active-filter-chips';
import { Pagination } from '@/components/shared/catalog/pagination';
import { EmptyCatalog, ProductGridSkeleton } from '@/components/shared/catalog/catalog-states';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Каталог',
  description: catalogSeoDescription,
  alternates: { canonical: '/catalog' },
  openGraph: {
    title: 'Каталог STRIDE',
    description: catalogSeoDescription,
    url: '/catalog',
    images: [{ url: defaultOgImage, alt: 'Каталог STRIDE' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Каталог STRIDE',
    description: catalogSeoDescription,
    images: [defaultOgImage],
  },
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { products, total, page, totalPages, facets } = await findProducts(sp);
  const [session, store] = await Promise.all([auth(), cookies()]);
  const wishlistedIds = await getWishlistProductIds(session, store.get(wishlistCookieName)?.value);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">Каталог</h1>
      <div className="grid md:grid-cols-[240px_1fr] gap-6 lg:gap-8">
        <FilterSidebar facets={facets} />
        <div>
          {/* Тулбар — sticky под хедером на телефоне (glassmorphism как у шапки), чтобы кнопка
              «Фильтры» была всегда на виду при скролле. С md+ статичный, фильтр в инлайн-сайдбаре. */}
          <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 md:mx-0 px-4 sm:px-6 md:px-0 py-2.5 md:py-0 mb-4 backdrop-blur-xl md:backdrop-blur-0 border-b border-line md:border-0 md:static flex items-center gap-3">
            <Suspense><MobileFilterDrawer facets={facets} total={total} /></Suspense>
            <p className="text-sm text-ink-muted hidden sm:block">Найдено <span className="font-semibold text-ink tnum">{total}</span></p>
            <div className="flex-1" />
            <Suspense><SortSelect /></Suspense>
          </div>
          <Suspense><ActiveFilterChips facets={facets} /></Suspense>
          {products.length === 0 ? (
            <EmptyCatalog />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {products.map((p) => <ProductCard key={p.slug} data={p} wishlisted={wishlistedIds.has(p.id)} />)}
            </div>
          )}
          <Suspense><Pagination page={page} totalPages={totalPages} /></Suspense>
        </div>
      </div>
    </div>
  );
}
