import { DetailSkeleton } from './detail-skeleton';
import type { SectionVariant } from './section-card-skeleton';

/**
 * Скелетон детальной admin-страницы (заказ, клиент). Корень несёт role="status".
 * Тело (back-link + шапка + grid lg:grid-cols-3) рисует DetailSkeleton.
 */
export interface DetailPageSkeletonProps {
  /** Карточек-Section в левой широкой колонке. По умолчанию 2. */
  leftSections?: number;
  /** Карточек-Section в правой колонке. По умолчанию 3. */
  rightSections?: number;
  /** Вид левой секции. По умолчанию 'list'. */
  leftVariant?: SectionVariant;
}

export function DetailPageSkeleton({ leftSections = 2, rightSections = 3, leftVariant = 'list' }: DetailPageSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Загрузка…">
      <DetailSkeleton leftSections={leftSections} rightSections={rightSections} leftVariant={leftVariant} />
    </div>
  );
}
