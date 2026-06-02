'use client';
import { EU_SIZE_GRID } from '@/constants/config';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function SizeFilter() {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList('size');
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Размер EU</p>
      <div className="flex flex-wrap gap-1.5">
        {EU_SIZE_GRID.map((s) => {
          const on = selected.includes(s);
          return (
            <button key={s} type="button" onClick={() => toggleInList('size', s)} aria-pressed={on}
              className={`px-2.5 py-1.5 rounded-lg border text-xs tnum ${on ? 'border-2 font-semibold border-ink' : 'border-line hover:border-ink'}`}>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
