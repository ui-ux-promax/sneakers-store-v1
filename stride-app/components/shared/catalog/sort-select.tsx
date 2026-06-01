'use client';
import { SORT_OPTIONS } from '@/constants/config';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function SortSelect() {
  const { get, setParam } = useCatalogUrl();
  const value = get('sort') || 'new';
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">Сортировка</span>
      <select className="inp !h-10 max-w-[200px] text-sm" value={value} onChange={(e) => setParam('sort', e.target.value === 'new' ? null : e.target.value)}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
