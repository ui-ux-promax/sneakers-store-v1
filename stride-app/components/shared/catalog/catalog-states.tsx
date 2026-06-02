import { Skeleton } from '@/components/ui';

export function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-surface border border-line overflow-hidden">
          <Skeleton className="aspect-square rounded-none" />
          <div className="p-3.5 space-y-2">
            <Skeleton className="h-2.5 w-16" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyCatalog() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-soft grid place-items-center text-xl mx-auto">👟</div>
      <p className="font-semibold mt-3">Таких кроссовок нет</p>
      <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">Под выбранные фильтры ничего не подошло. Сбрось часть условий или выбери другой размер.</p>
    </div>
  );
}
