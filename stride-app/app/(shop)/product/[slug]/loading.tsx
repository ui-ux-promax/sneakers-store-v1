import { Skeleton } from '@/components/ui';

// Скелетон PDP — повторяет верхний экран: галерея (рельс + квадратный hero) + панель покупки.
export default function ProductLoading() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pb-16" aria-hidden>
      {/* Хлебные крошки */}
      <Skeleton className="h-3 w-72 max-w-full mt-6 mb-6" />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_440px] gap-6 lg:gap-10">
        {/* Галерея: рельс миниатюр + крупный квадрат */}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <div className="flex sm:flex-col gap-2.5 sm:w-[84px] sm:shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="w-[72px] sm:w-full aspect-square rounded-xl shrink-0" />
            ))}
          </div>
          <Skeleton className="flex-1 aspect-square rounded-[24px]" />
        </div>

        {/* Панель покупки */}
        <div className="space-y-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-40" />
          {/* Расцветка */}
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-2.5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="w-11 h-11 rounded-xl" />)}
            </div>
          </div>
          {/* Размеры */}
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-20" />
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
            </div>
          </div>
          {/* В корзину */}
          <Skeleton className="h-12 w-full rounded-full mt-2" />
        </div>
      </div>
    </div>
  );
}
