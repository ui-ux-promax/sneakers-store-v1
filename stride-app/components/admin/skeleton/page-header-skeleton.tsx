import { Skeleton } from './skeleton';

/**
 * Шапка списочной/дашборд-страницы: заголовок (text-3xl или text-2xl) + подзаголовок,
 * опц. правый блок действий — pill-toggle вида и/или кнопка «Добавить».
 * Геометрия с `orders/page.tsx` и `catalog/products/page.tsx`:
 * `flex flex-wrap gap-4 justify-between items-end`.
 */
export interface PageHeaderSkeletonProps {
  /** Кнопка «Добавить» справа (h-10 pill). */
  withAction?: boolean;
  /** Pill-toggle вида рядом с кнопкой (товары). */
  withViewToggle?: boolean;
  /** Меньший заголовок (text-2xl Heading) вместо text-3xl. */
  headingSmall?: boolean;
}

export function PageHeaderSkeleton({ withAction, withViewToggle, headingSmall }: PageHeaderSkeletonProps) {
  return (
    <div aria-hidden className="flex flex-wrap gap-4 justify-between items-end">
      <div>
        {/* h2: text-3xl ≈ 30px / text-2xl ≈ 24px высоты строки */}
        <Skeleton rounded="line" className={headingSmall ? 'h-7 w-48 mb-2' : 'h-8 w-56 mb-2'} />
        <Skeleton rounded="line" delay={1} className="h-3.5 w-72" />
      </div>
      {(withAction || withViewToggle) && (
        <div className="flex items-center gap-3">
          {withViewToggle && <Skeleton rounded="pill" delay={1} className="h-10 w-40" />}
          {withAction && <Skeleton rounded="pill" delay={2} className="h-10 w-40" />}
        </div>
      )}
    </div>
  );
}
