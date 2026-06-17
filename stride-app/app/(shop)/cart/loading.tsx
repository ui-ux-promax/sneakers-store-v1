import { Skeleton } from '@/components/ui';

// Скелетон корзины — повторяет раскладку page.tsx (список позиций + сводка заказа).
export default function CartLoading() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 pt-8 pb-16" aria-hidden>
      <Skeleton className="h-9 w-44 rounded-xl" />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 mt-6">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4 h-fit">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
