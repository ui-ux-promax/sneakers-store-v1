import { CheckboxFacet } from './checkbox-facet';
import { SizeFilter } from './size-filter';
import { ColorFilter } from './color-filter';
import { PriceFilter } from './price-filter';
import { InStockToggle } from './in-stock-toggle';
import { ResetButton } from './active-filter-chips';
import type { CatalogResult } from '@/lib/find-products';

// Общий список фасетов: инлайн-сайдбар (md+) и мобильный drawer (<md) рендерят одно и то же.
// showHeading=false в drawer — там свой заголовок «Фильтры» + крестик в шапке панели.
export function FilterControls({
  facets,
  showHeading = true,
}: {
  facets: CatalogResult['facets'];
  showHeading?: boolean;
}) {
  return (
    <div className="space-y-5">
      {showHeading && (
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Фильтры</h2>
          <ResetButton className="text-xs font-semibold text-ink-muted underline underline-offset-2 hover:text-ink" />
        </div>
      )}
      <CheckboxFacet title="Категория" paramKey="category" options={facets.categories} />
      <CheckboxFacet title="Бренд" paramKey="brand" options={facets.brands} />
      <CheckboxFacet title="Пол" paramKey="gender" options={facets.genders} />
      <SizeFilter />
      <PriceFilter min={facets.price.min} max={facets.price.max} />
      <ColorFilter colors={facets.colors} />
      <InStockToggle />
    </div>
  );
}
