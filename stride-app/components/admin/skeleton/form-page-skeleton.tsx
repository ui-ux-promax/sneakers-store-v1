import { Skeleton } from './skeleton';
import { FormSkeleton } from './form-skeleton';

/**
 * Скелетон страницы-формы (новый/редактируемый купон, товар, категория).
 * Корень несёт role="status". Сверху back-link + заголовок страницы, ниже —
 * тело формы (FormSkeleton): поля + Switch + кнопки.
 */
export interface FormPageSkeletonProps {
  /** Число текстовых полей. По умолчанию 4. */
  fields?: number;
  /** Доп. блоки изображений/вариантов для product-формы. */
  complex?: boolean;
  /** Меньший заголовок (text-2xl) вместо text-3xl. */
  headingSmall?: boolean;
}

export function FormPageSkeleton({ fields = 4, complex, headingSmall }: FormPageSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Загрузка…" className="space-y-8">
      {/* back-link + заголовок */}
      <div aria-hidden className="space-y-4">
        <Skeleton rounded="line" className="h-4 w-28" />
        <Skeleton rounded="line" className={headingSmall ? 'h-7 w-48' : 'h-8 w-56'} />
      </div>
      <FormSkeleton fields={fields} complex={complex} />
    </div>
  );
}
