'use client';
import { X } from 'lucide-react';
import { useCatalogUrl } from '@/hooks/use-catalog-url';
import type { CatalogResult } from '@/lib/find-products';

export function ResetButton({ className }: { className?: string }) {
  const { reset } = useCatalogUrl();
  return <button type="button" onClick={reset} className={className}>Сбросить</button>;
}

export function ActiveFilterChips({ facets }: { facets: CatalogResult['facets'] }) {
  const { sp, getList, toggleInList, get, setParam, reset } = useCatalogUrl();
  const chips: { key: string; value: string; label: string }[] = [];
  const labelFor = (key: string, value: string) => {
    if (key === 'category') return facets.categories.find((c) => c.value === value)?.label ?? value;
    if (key === 'brand') return value;
    if (key === 'gender') return facets.genders.find((g) => g.value === value)?.label ?? value;
    if (key === 'color') return facets.colors.find((c) => c.slug === value)?.name ?? value;
    if (key === 'size') return `Размер ${value}`;
    return value;
  };
  ['category', 'brand', 'gender', 'color', 'size'].forEach((key) => getList(key).forEach((v) => chips.push({ key, value: v, label: labelFor(key, v) })));
  if (get('inStock') === '1') chips.push({ key: 'inStock', value: '1', label: 'Только в наличии' });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {chips.map((c) => (
        <span key={`${c.key}:${c.value}`} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full bg-surface-soft border border-line">
          {c.label}
          <button type="button" aria-label={`Убрать фильтр ${c.label}`} className="text-ink-muted hover:text-danger"
            onClick={() => (c.key === 'inStock' ? setParam('inStock', null) : toggleInList(c.key, c.value))}>
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
      <button type="button" onClick={reset} className="text-sm font-semibold text-ink-muted underline underline-offset-2 hover:text-ink ml-1">Сбросить всё</button>
    </div>
  );
}
