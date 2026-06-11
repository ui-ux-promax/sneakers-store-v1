import { FilterControls } from './filter-controls';
import type { CatalogResult } from '@/lib/find-products';

// Инлайн-сайдбар с md (768px): на 1023px фильтр на месте рядом с 2-кол сеткой.
// Ниже md фасеты живут в MobileFilterDrawer. Узкий (~240px колонка задаётся гридом страницы).
export function FilterSidebar({ facets }: { facets: CatalogResult['facets'] }) {
  return (
    <aside className="hidden md:block">
      <div className="sticky top-20 rounded-2xl border border-line bg-surface p-4 lg:p-5">
        <FilterControls facets={facets} />
      </div>
    </aside>
  );
}
