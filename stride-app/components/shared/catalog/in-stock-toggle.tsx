'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function InStockToggle() {
  const { get, setParam } = useCatalogUrl();
  const on = get('inStock') === '1';
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Наличие</p>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" className="w-4 h-4 rounded accent-[hsl(var(--color-primary))]" checked={on} onChange={() => setParam('inStock', on ? null : '1')} />
        <span>Скрыть распроданные</span>
      </label>
    </div>
  );
}
