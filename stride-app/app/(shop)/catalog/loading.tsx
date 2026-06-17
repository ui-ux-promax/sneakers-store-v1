import { Skeleton } from '@/components/ui';
import { ProductGridSkeleton } from '@/components/shared/catalog/catalog-states';

// Скелетон каталога — повторяет раскладку page.tsx (сайдбар-фильтры + тулбар + грид карточек).
export default function CatalogLoading() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8" aria-hidden>
      <Skeleton className="h-9 w-40 mb-6 rounded-xl" />
      <div className="grid md:grid-cols-[240px_1fr] gap-6 lg:gap-8">
        {/* Сайдбар-фильтры (только md+) */}
        <div className="hidden md:block space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            </div>
          ))}
        </div>
        <div>
          {/* Тулбар: фильтр (моб) + счётчик + сортировка */}
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-9 w-28 rounded-full md:hidden" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <div className="flex-1" />
            <Skeleton className="h-9 w-40 rounded-full" />
          </div>
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}
