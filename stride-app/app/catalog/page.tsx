import { Suspense } from 'react';
import { findProducts } from '@/lib/find-products';
import { ProductCard } from '@/components/shared/product-card';
import { FilterSidebar } from '@/components/shared/catalog/filter-sidebar';
import { SortSelect } from '@/components/shared/catalog/sort-select';
import { ActiveFilterChips } from '@/components/shared/catalog/active-filter-chips';
import { Pagination } from '@/components/shared/catalog/pagination';
import { EmptyCatalog, ProductGridSkeleton } from '@/components/shared/catalog/catalog-states';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Каталог' };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { products, total, page, totalPages, facets } = await findProducts(sp);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8">
      <h1 className="font-display font-bold text-[28px] sm:text-[40px] mb-6">Каталог</h1>
      <div className="grid lg:grid-cols-[260px_1fr] gap-6 lg:gap-8">
        <FilterSidebar facets={facets} />
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-sm text-ink-muted hidden sm:block">Найдено <span className="font-semibold text-ink tnum">{total}</span></p>
            <div className="flex-1" />
            <Suspense><SortSelect /></Suspense>
          </div>
          <Suspense><ActiveFilterChips facets={facets} /></Suspense>
          {products.length === 0 ? (
            <EmptyCatalog />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {products.map((p) => <ProductCard key={p.slug} data={p} />)}
            </div>
          )}
          <Suspense><Pagination page={page} totalPages={totalPages} /></Suspense>
        </div>
      </div>
    </div>
  );
}
