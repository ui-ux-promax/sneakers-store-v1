import { Skeleton } from './skeleton';

/**
 * Фильтр-бар: ряд пилюль-контролов. С `products`: `grid grid-cols-1 md:grid-cols-5 gap-4`,
 * первый — поиск-пилюля (шире), остальные — Radix-селекты-пилюли (h-10, rounded-full).
 * Число колонок гибкое: при filterCount=5 → md:grid-cols-5 и т.д.
 */
export interface FilterBarSkeletonProps {
  /** Сколько пилюль в баре (включая поиск). По умолчанию 4. */
  filterCount?: number;
}

// Статический маппинг — Tailwind должен видеть классы целиком (без интерполяции).
const COLS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

export function FilterBarSkeleton({ filterCount = 4 }: FilterBarSkeletonProps) {
  const count = Math.max(1, filterCount);
  const cols = COLS[count] ?? 'md:grid-cols-4';
  return (
    <div aria-hidden className={`grid grid-cols-1 ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          rounded="pill"
          delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
          className="h-10 w-full"
        />
      ))}
    </div>
  );
}
