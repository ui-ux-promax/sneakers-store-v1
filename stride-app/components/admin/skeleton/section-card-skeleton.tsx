import { Skeleton } from './skeleton';

/**
 * Карточка-Section детальной страницы: `bg-admin-surface border rounded-xl p-6`,
 * заголовок h3 (font-admin-head text-lg) + тело одного из видов:
 *  - `dl`    — строки «лейбл … значение» (профиль/итоги/оплата), как `Row` в деталях;
 *  - `table` — мини-таблица истории заказов (customers/[id]);
 *  - `list`  — список позиций с thumbnail (orders/[id] «Позиции», best-sellers).
 */
export type SectionVariant = 'dl' | 'table' | 'list';

export interface SectionCardSkeletonProps {
  variant?: SectionVariant;
  /** Число строк/позиций в теле. По умолчанию 4. */
  rows?: number;
  /** Стартовая стаггер-задержка карточки (1..5), чтобы блики не маршировали синхронно. */
  delay?: 1 | 2 | 3 | 4 | 5;
}

function step(start: number, i: number): 1 | 2 | 3 | 4 | 5 {
  return (((start - 1 + i) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

export function SectionCardSkeleton({ variant = 'list', rows = 4, delay = 1 }: SectionCardSkeletonProps) {
  const count = Math.max(1, rows);
  return (
    <div aria-hidden className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      {/* h3 заголовок */}
      <Skeleton rounded="line" delay={delay} className="h-5 w-40 mb-4" />

      {variant === 'dl' && (
        <div className="space-y-2">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton rounded="line" delay={step(delay, i)} className="h-3 w-24" />
              <Skeleton rounded="line" delay={step(delay, i + 1)} className="h-3 w-28" />
            </div>
          ))}
        </div>
      )}

      {variant === 'table' && (
        <div className="space-y-3">
          {/* строка-заголовок таблицы */}
          <div className="flex items-center gap-4">
            {['w-16', 'w-24', 'w-20', 'w-16'].map((w, i) => (
              <Skeleton key={i} rounded="line" delay={delay} className={`h-2.5 ${w}`} />
            ))}
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton rounded="line" delay={step(delay, i)} className="h-3 w-16" />
              <Skeleton rounded="line" delay={step(delay, i)} className="h-3 w-28" />
              <Skeleton rounded="pill" delay={step(delay, i + 1)} className="h-5 w-20" />
              <Skeleton rounded="line" delay={step(delay, i + 1)} className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {variant === 'list' && (
        <div className="divide-y divide-admin-outline-variant">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <Skeleton rounded="box" delay={step(delay, i)} className="w-14 h-14 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton rounded="line" delay={step(delay, i)} className="h-3 w-40" />
                <Skeleton rounded="line" delay={step(delay, i + 1)} className="h-2.5 w-28" />
              </div>
              <div className="text-right space-y-2">
                <Skeleton rounded="line" delay={step(delay, i + 1)} className="h-3 w-16 ml-auto" />
                <Skeleton rounded="line" delay={step(delay, i + 2)} className="h-2.5 w-12 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
