'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';
import type { Facet } from '@/lib/find-products';

export function CheckboxFacet({ title, paramKey, options }: { title: string; paramKey: string; options: Facet[] }) {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList(paramKey);
  if (!options.length) return null;
  return (
    <div className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <p className="font-semibold text-sm mb-2">{title}</p>
      <div className="space-y-1.5 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-[hsl(var(--color-primary))]" checked={selected.includes(o.value)} onChange={() => toggleInList(paramKey, o.value)} />
            <span>{o.label}</span>
            <span className="text-ink-muted ml-auto tnum">{o.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
