import { Skeleton } from './skeleton';

/**
 * Ряд bento-метрик (StatCard) под таблицей товаров: `grid md:grid-cols-{n} gap-6`.
 * Каждая карточка `bg-admin-surface p-6 rounded-xl border`: icon-чип 40×40 + tag-метка,
 * лейбл (uppercase), значение (font-admin-head text-2xl). Совпадает с products StatCard.
 */
export interface StatCardsSkeletonProps {
  /** Число карточек. По умолчанию 3. */
  count?: number;
}

const COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
};

export function StatCardsSkeleton({ count = 3 }: StatCardsSkeletonProps) {
  const n = Math.max(1, count);
  const cols = COLS[n] ?? 'md:grid-cols-3';
  return (
    <div aria-hidden className={`grid grid-cols-1 ${cols} gap-6`}>
      {Array.from({ length: n }).map((_, i) => {
        const delay = ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;
        return (
          <div
            key={i}
            className="bg-admin-surface p-6 rounded-xl border border-admin-outline-variant"
          >
            <div className="flex justify-between items-start mb-4">
              <Skeleton rounded="box" delay={delay} className="w-10 h-10 rounded-lg" />
              <Skeleton rounded="line" delay={delay} className="h-3.5 w-12" />
            </div>
            <Skeleton rounded="line" delay={delay} className="h-2.5 w-24 mb-2" />
            <Skeleton rounded="line" delay={delay} className="h-6 w-20" />
          </div>
        );
      })}
    </div>
  );
}
