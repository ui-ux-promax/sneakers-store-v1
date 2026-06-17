import { Skeleton } from '@/components/ui';

// Скелетон оформления — повторяет раскладку CheckoutForm (форма слева + сводка-aside справа).
function FieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

export default function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-[1240px] px-4 sm:px-6 py-10" aria-hidden>
      <Skeleton className="h-9 w-64 mb-6 rounded-xl" />
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
        <div className="space-y-6">
          {/* Контактные данные (3 поля) */}
          <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <Skeleton className="h-6 w-48" />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          {/* Адрес */}
          <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <Skeleton className="h-6 w-44" />
            <FieldSkeleton />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </div>
          {/* Доставка + оплата (по 2 опции) */}
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="rounded-2xl border border-line bg-surface p-5 space-y-3">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ))}
        </div>

        <aside>
          <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <Skeleton className="h-6 w-36" />
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 w-24 rounded-full" />
            </div>
            <div className="space-y-2 border-t border-line pt-4">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <div className="space-y-2 border-t border-line pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        </aside>
      </div>
    </main>
  );
}
