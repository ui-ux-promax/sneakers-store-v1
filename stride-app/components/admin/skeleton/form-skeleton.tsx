import { Skeleton } from './skeleton';

/**
 * Тело формы (coupon-form / product-form): `space-y-6 max-w-2xl`.
 * Поле = лейбл (text-sm) + контрол (Input h-10 rounded-xl). Ниже — ряд Switch,
 * затем кнопки «Сохранить» + «Отмена». `complex` добавляет блоки изображений/вариантов
 * (product-форма): сетка thumbnail'ов + строки-варианты.
 * Корень (role/aria) задаёт FormPageSkeleton — тут только разметка тела.
 */
export interface FormSkeletonProps {
  /** Число текстовых полей. По умолчанию 4. */
  fields?: number;
  /** Доп. блоки изображений/вариантов для product-формы. */
  complex?: boolean;
}

export function FormSkeleton({ fields = 4, complex }: FormSkeletonProps) {
  const n = Math.max(1, fields);
  return (
    <div aria-hidden className="space-y-6 max-w-2xl">
      {Array.from({ length: n }).map((_, i) => {
        const delay = ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;
        return (
          <div key={i} className="space-y-1.5">
            {/* label */}
            <Skeleton rounded="line" delay={delay} className="h-3 w-24" />
            {/* Input h-10 rounded-xl */}
            <Skeleton rounded="box" delay={delay} className="h-10 w-full rounded-xl" />
          </div>
        );
      })}

      {complex && (
        <>
          {/* Блок изображений: лейбл + сетка thumbnail'ов */}
          <div className="space-y-2">
            <Skeleton rounded="line" className="h-3 w-32" />
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  rounded="box"
                  delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
                  className="aspect-square w-full rounded-xl"
                />
              ))}
            </div>
          </div>
          {/* Блок вариантов: ряды size/sku/stock */}
          <div className="space-y-2">
            <Skeleton rounded="line" className="h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton rounded="box" delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5} className="h-10 flex-1 rounded-xl" />
                  <Skeleton rounded="box" delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5} className="h-10 flex-1 rounded-xl" />
                  <Skeleton rounded="box" delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5} className="h-10 w-20 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Ряд Switch */}
      <div className="flex items-center gap-3">
        <Skeleton rounded="pill" delay={2} className="h-6 w-11" />
        <Skeleton rounded="line" delay={2} className="h-3 w-20" />
      </div>

      {/* Кнопки */}
      <div className="flex gap-3">
        <Skeleton rounded="pill" delay={3} className="h-10 w-28" />
        <Skeleton rounded="pill" delay={4} className="h-10 w-24" />
      </div>
    </div>
  );
}
