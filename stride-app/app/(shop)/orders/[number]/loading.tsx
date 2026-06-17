import { Skeleton } from '@/components/ui';

// Скелетон заказа — повторяет раскладку page.tsx (заголовок+статус, позиции, итоги, доставка).
export default function OrderLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <Skeleton className="h-3 w-32" />

      {/* Позиции */}
      <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Итоги */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-2">
        <div className="flex justify-between"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-16" /></div>
        <div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
        <div className="flex justify-between border-t border-line pt-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-24" /></div>
      </div>

      {/* Доставка */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </main>
  );
}
