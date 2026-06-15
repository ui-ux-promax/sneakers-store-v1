import { Skeleton } from './skeleton';

/**
 * Карточка-таблица: контейнер `bg-admin-surface border rounded-xl overflow-hidden`,
 * шапка `thead bg-admin-surface-high`, строки `divide-y`, подвал-пагинация
 * `border-t … flex justify-between`. Совпадает с order-table / product-table.
 * Первая ячейка опц. содержит thumbnail-квадрат (w-12 h-12) + текст.
 */
export interface TableSkeletonProps {
  /** Число строк тела. По умолчанию 8. */
  rows?: number;
  /** Число колонок. По умолчанию 5. */
  cols?: number;
  /** Thumbnail-квадрат в первой ячейке (товары/заказы с обложкой). */
  withThumb?: boolean;
}

export function TableSkeleton({ rows = 8, cols = 5, withThumb }: TableSkeletonProps) {
  const colCount = Math.max(1, cols);
  return (
    <div
      aria-hidden
      className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-admin-surface-high">
            <tr>
              {Array.from({ length: colCount }).map((_, c) => (
                <th key={c} className="px-6 py-4">
                  <Skeleton rounded="line" className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-outline-variant">
            {Array.from({ length: Math.max(1, rows) }).map((_, r) => {
              const delay = ((r % 5) + 1) as 1 | 2 | 3 | 4 | 5;
              return (
                <tr key={r}>
                  {Array.from({ length: colCount }).map((_, c) => (
                    <td key={c} className="px-6 py-4">
                      {c === 0 && withThumb ? (
                        <div className="flex items-center gap-3">
                          <Skeleton rounded="box" delay={delay} className="w-12 h-12 rounded-lg shrink-0" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton rounded="line" delay={delay} className="h-3 w-32" />
                            <Skeleton rounded="line" delay={delay} className="h-2.5 w-20" />
                          </div>
                        </div>
                      ) : (
                        <Skeleton
                          rounded="line"
                          delay={delay}
                          className={c === 0 ? 'h-3 w-28' : 'h-3 w-16'}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Подвал-пагинация */}
      <div className="px-6 py-4 border-t border-admin-outline-variant flex items-center justify-between">
        <Skeleton rounded="line" className="h-3 w-40" />
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              rounded="box"
              delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
              className="w-8 h-8 rounded-lg"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
