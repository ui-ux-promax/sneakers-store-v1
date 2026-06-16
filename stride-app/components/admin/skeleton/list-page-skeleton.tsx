import { PageHeaderSkeleton } from './page-header-skeleton';
import { StatusChipsSkeleton } from './status-chips-skeleton';
import { FilterBarSkeleton } from './filter-bar-skeleton';
import { TableSkeleton } from './table-skeleton';
import { StatCardsSkeleton } from './stat-cards-skeleton';

/**
 * Скелетон списочной admin-страницы (заказы, товары, категории, клиенты, купоны).
 * Корень несёт role="status" aria-busy aria-label — внутренние узлы декоративны.
 * Структура повторяет реальные страницы: шапка → [чипы статусов] → фильтр-бар →
 * карточка-таблица → [нижний ряд bento StatCard].
 */
export interface ListPageSkeletonProps {
  /** Ряд чипов-счётчиков статусов (заказы). */
  withStatusChips?: boolean;
  /** Правая кнопка «Добавить» в шапке. */
  withAction?: boolean;
  /** Pill-toggle вида рядом с кнопкой (товары). */
  withViewToggle?: boolean;
  /** Нижний ряд bento StatCard (товары). */
  withStatCards?: boolean;
  /** Число StatCard. По умолчанию 3. */
  statCardCount?: number;
  /** Показывать фильтр-бар. По умолчанию true (категории — без фильтров). */
  withFilter?: boolean;
  /** Число пилюль фильтр-бара. По умолчанию 4. */
  filterCount?: number;
  /** Число строк таблицы. По умолчанию 8. */
  tableRows?: number;
  /** Число колонок таблицы. По умолчанию 5. */
  tableCols?: number;
  /** Thumbnail-квадрат в первой ячейке. */
  withThumb?: boolean;
  /** Меньший заголовок (text-2xl) вместо text-3xl. */
  headingSmall?: boolean;
}

export function ListPageSkeleton({
  withStatusChips,
  withAction,
  withViewToggle,
  withStatCards,
  statCardCount = 3,
  withFilter = true,
  filterCount = 4,
  tableRows = 8,
  tableCols = 5,
  withThumb,
  headingSmall,
}: ListPageSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Загрузка…" className="space-y-8">
      <PageHeaderSkeleton withAction={withAction} withViewToggle={withViewToggle} headingSmall={headingSmall} />
      {withStatusChips && <StatusChipsSkeleton />}
      {withFilter && <FilterBarSkeleton filterCount={filterCount} />}
      <TableSkeleton rows={tableRows} cols={tableCols} withThumb={withThumb} />
      {withStatCards && <StatCardsSkeleton count={statCardCount} />}
    </div>
  );
}
