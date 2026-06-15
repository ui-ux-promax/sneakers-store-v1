import { Skeleton } from './skeleton';
import { SectionCardSkeleton, type SectionVariant } from './section-card-skeleton';

/**
 * Тело детальной страницы (orders/[id], customers/[id]): back-link + шапка
 * (h2 text-3xl + статус-бейджи) + `grid lg:grid-cols-3 gap-6`:
 * слева широкая колонка `lg:col-span-2` (карточки-Section), справа — узкая.
 * Сам корень (role/aria) задаёт DetailPageSkeleton — тут только разметка тела.
 */
export interface DetailSkeletonProps {
  /** Карточек-Section в левой широкой колонке. По умолчанию 2. */
  leftSections?: number;
  /** Карточек-Section в правой колонке. По умолчанию 3. */
  rightSections?: number;
  /** Вид левой секции. По умолчанию 'list'. */
  leftVariant?: SectionVariant;
}

export function DetailSkeleton({ leftSections = 2, rightSections = 3, leftVariant = 'list' }: DetailSkeletonProps) {
  return (
    <div aria-hidden className="space-y-8">
      {/* Назад */}
      <Skeleton rounded="line" className="h-4 w-28" />

      {/* Шапка: заголовок + бейджи */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton rounded="line" className="h-8 w-56" />
        <Skeleton rounded="pill" delay={1} className="h-6 w-24" />
        <Skeleton rounded="pill" delay={2} className="h-6 w-20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Левая широкая колонка */}
        <div className="lg:col-span-2 space-y-6">
          {Array.from({ length: Math.max(1, leftSections) }).map((_, i) => (
            <SectionCardSkeleton
              key={i}
              variant={leftVariant}
              delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            />
          ))}
        </div>

        {/* Правая узкая колонка — короткие dl-секции */}
        <div className="space-y-6">
          {Array.from({ length: Math.max(1, rightSections) }).map((_, i) => (
            <SectionCardSkeleton
              key={i}
              variant="dl"
              rows={3}
              delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
