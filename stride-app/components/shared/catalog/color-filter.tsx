'use client';
import { useCatalogUrl } from '@/hooks/use-catalog-url';

export function ColorFilter({ colors }: { colors: { slug: string; name: string; swatchHex: string | null }[] }) {
  const { getList, toggleInList } = useCatalogUrl();
  const selected = getList('color');
  if (!colors.length) return null;
  return (
    <div className="border-t border-line pt-4">
      <p className="font-semibold text-sm mb-2">Цвет</p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const on = selected.includes(c.slug);
          return (
            <button key={c.slug} type="button" onClick={() => toggleInList('color', c.slug)} aria-pressed={on}
              aria-label={on ? `${c.name}, выбран` : c.name}
              className={`w-7 h-7 rounded-full border border-line ${on ? 'ring-2 ring-offset-2 ring-[hsl(var(--color-primary))]' : ''}`}
              style={{ background: c.swatchHex ?? '#ccc' }} />
          );
        })}
      </div>
    </div>
  );
}
