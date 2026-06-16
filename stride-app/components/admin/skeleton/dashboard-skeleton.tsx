import { Skeleton } from './skeleton';

/**
 * Тело дашборда (`admin/page.tsx`): шапка (title + period-toggle справа),
 * ряд 5 KPI-карточек (`xl:grid-cols-5`), `grid-cols-12` → area-chart `xl:col-span-8`
 * + donut `xl:col-span-4`, нижний ряд: топ-продаж `lg:col-span-5` +
 * (низкий сток + последние заказы) `lg:col-span-7`.
 * Корень (role/aria) задаёт DashboardSkeleton-обёртка ниже.
 */
function KpiCardSkeleton({ delay }: { delay: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-6">
      <div className="flex justify-between items-start mb-4">
        <Skeleton rounded="box" delay={delay} className="w-10 h-10 rounded-lg" />
        <Skeleton rounded="line" delay={delay} className="h-3.5 w-12" />
      </div>
      <Skeleton rounded="line" delay={delay} className="h-2.5 w-20 mb-2" />
      <Skeleton rounded="line" delay={delay} className="h-6 w-24" />
    </div>
  );
}

function CardSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-admin-surface border border-admin-outline-variant rounded-xl p-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function DashboardBody() {
  return (
    <div aria-hidden className="space-y-8">
      {/* Шапка: title + period-toggle */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton rounded="line" className="h-8 w-64 mb-2" />
          <Skeleton rounded="line" delay={1} className="h-3.5 w-72" />
        </div>
        <Skeleton rounded="pill" delay={1} className="h-9 w-48" />
      </div>

      {/* 5 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        {[1, 2, 3, 4, 5].map((d) => (
          <KpiCardSkeleton key={d} delay={d as 1 | 2 | 3 | 4 | 5} />
        ))}
      </div>

      {/* Графики: area (8) + donut (4) */}
      <div className="grid grid-cols-12 gap-6">
        <CardSkeleton className="col-span-12 xl:col-span-8">
          <Skeleton rounded="line" className="h-5 w-44 mb-4" />
          <Skeleton rounded="box" delay={1} className="w-full h-72 rounded-2xl" />
        </CardSkeleton>
        <CardSkeleton className="col-span-12 xl:col-span-4 flex flex-col">
          <Skeleton rounded="line" className="h-5 w-40 mb-6" />
          <Skeleton rounded="circle" delay={1} className="w-44 h-44 mx-auto mb-8" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((d) => (
              <div key={d} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Skeleton rounded="circle" delay={d as 1 | 2 | 3 | 4} className="w-3 h-3" />
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-20" />
                </div>
                <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-9" />
              </div>
            ))}
          </div>
        </CardSkeleton>
      </div>

      {/* Нижний ряд: топ-продаж (5) + низкий сток / последние заказы (7) */}
      <div className="grid grid-cols-12 gap-6">
        {/* Топ продаж */}
        <CardSkeleton className="col-span-12 lg:col-span-5">
          <Skeleton rounded="line" className="h-5 w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((d) => (
              <div
                key={d}
                className="flex items-center gap-4 p-3 rounded-xl bg-admin-surface-low border border-admin-outline-variant"
              >
                <Skeleton rounded="box" delay={d as 1 | 2 | 3} className="w-14 h-14 rounded-lg shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3} className="h-3 w-32" />
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3} className="h-2.5 w-20" />
                </div>
                <div className="text-right space-y-2 shrink-0">
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3} className="h-3 w-16 ml-auto" />
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3} className="h-2.5 w-12 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </CardSkeleton>

        {/* Низкий сток + последние заказы */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          {/* Низкий сток: сетка 2× */}
          <CardSkeleton>
            <div className="flex justify-between items-center mb-4">
              <Skeleton rounded="line" className="h-5 w-36" />
              <Skeleton rounded="pill" delay={1} className="h-6 w-16" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((d) => (
                <div
                  key={d}
                  className="p-3 rounded-xl border border-admin-outline-variant flex justify-between items-center gap-2"
                >
                  <div className="min-w-0 space-y-2">
                    <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-24" />
                    <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-2.5 w-32" />
                  </div>
                  <div className="text-right space-y-1.5 shrink-0">
                    <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-5 w-7 ml-auto" />
                    <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-2 w-14 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </CardSkeleton>

          {/* Последние заказы: мини-таблица */}
          <div className="bg-admin-surface border border-admin-outline-variant rounded-xl overflow-hidden">
            <div className="p-6 pb-3">
              <Skeleton rounded="line" className="h-5 w-40" />
            </div>
            <div className="bg-admin-surface-high border-y border-admin-outline-variant px-6 py-3 flex gap-6">
              {['w-16', 'w-20', 'w-16', 'w-14'].map((w, i) => (
                <Skeleton key={i} rounded="line" className={`h-2.5 ${w}`} />
              ))}
            </div>
            <div className="divide-y divide-admin-outline-variant">
              {[1, 2, 3, 4].map((d) => (
                <div key={d} className="px-6 py-3 flex items-center justify-between gap-4">
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-16" />
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-28" />
                  <Skeleton rounded="pill" delay={d as 1 | 2 | 3 | 4} className="h-5 w-20" />
                  <Skeleton rounded="line" delay={d as 1 | 2 | 3 | 4} className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Публичный композит дашборда — без пропов. Корень несёт role="status". */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Загрузка…">
      <DashboardBody />
    </div>
  );
}
