import { CheckboxFacet } from './checkbox-facet';
import { SizeFilter } from './size-filter';
import { ColorFilter } from './color-filter';
import { PriceFilter } from './price-filter';
import { InStockToggle } from './in-stock-toggle';
import { ResetButton } from './active-filter-chips';
import type { CatalogResult } from '@/lib/find-products';

export function FilterSidebar({ facets }: { facets: CatalogResult['facets'] }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 rounded-2xl border border-line bg-surface p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Фильтры</h2>
          <ResetButton className="text-xs font-semibold text-ink-muted underline underline-offset-2 hover:text-ink" />
        </div>
        <CheckboxFacet title="Категория" paramKey="category" options={facets.categories} />
        <CheckboxFacet title="Бренд" paramKey="brand" options={facets.brands} />
        <CheckboxFacet title="Пол" paramKey="gender" options={facets.genders} />
        <SizeFilter />
        <PriceFilter />
        <ColorFilter colors={facets.colors} />
        <InStockToggle />
      </div>
    </aside>
  );
}
