'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAdminReady } from './admin-ready';
import {
  DashboardSkeleton,
  ListPageSkeleton,
  DetailPageSkeleton,
  FormPageSkeleton,
} from '@/components/admin/skeleton';

/**
 * Скелетон под текущий путь — для оверлея на ПЕРВОМ (холодном) заходе, пока серверный
 * loading.tsx уже снят (данные пришли), но клиент ещё не готов (шрифт/Recharts).
 * Зеркалит дерево loading.tsx; при cold-load на неучтённый путь — нейтральный список.
 */
function PageSkeleton({ pathname }: { pathname: string }) {
  // Детали
  if (/^\/admin\/orders\/[^/]+$/.test(pathname))
    return <DetailPageSkeleton leftSections={2} rightSections={3} leftVariant="list" />;
  if (/^\/admin\/customers\/[^/]+$/.test(pathname))
    return <DetailPageSkeleton leftSections={1} leftVariant="table" rightSections={3} />;

  // Формы
  if (/^\/admin\/marketing\/(new|[^/]+\/edit)$/.test(pathname))
    return <FormPageSkeleton fields={4} />;
  if (/^\/admin\/catalog\/products\/(new|[^/]+\/edit)$/.test(pathname))
    return <FormPageSkeleton fields={6} complex />;
  if (/^\/admin\/catalog\/categories\/(new|[^/]+\/edit)$/.test(pathname))
    return <FormPageSkeleton fields={3} headingSmall />;

  // Списки
  if (pathname === '/admin/orders')
    return <ListPageSkeleton withStatusChips filterCount={3} tableCols={6} withThumb />;
  if (pathname === '/admin/customers')
    return <ListPageSkeleton filterCount={3} tableCols={5} />;
  if (pathname === '/admin/marketing')
    return <ListPageSkeleton withAction filterCount={2} tableCols={5} />;
  if (pathname === '/admin/catalog/categories')
    return <ListPageSkeleton withAction withFilter={false} tableCols={4} withThumb headingSmall />;
  if (pathname === '/admin/catalog' || pathname === '/admin/catalog/products')
    return (
      <ListPageSkeleton
        withAction
        withViewToggle
        withStatCards
        statCardCount={3}
        filterCount={5}
        tableCols={6}
        withThumb
      />
    );

  // Дашборд + нейтральный fallback
  if (pathname === '/admin') return <DashboardSkeleton />;
  return <ListPageSkeleton />;
}

/**
 * Гейт основного контента. Пока админка не готова (useAdminReady — тот же сигнал, что у
 * SidebarSkeletonGate), держит скелетон-оверлей поверх контента, закрывая полу-собранное
 * состояние первого холодного захода (иконки скрыты FOUT-гардом, Recharts ещё не отрисованы).
 * После первой готовности оверлей больше не показывается (синглтон в useAdminReady) — дальше
 * работает обычный per-route loading.tsx.
 */
export function ContentReadyGate({ children }: { children: ReactNode }) {
  const ready = useAdminReady();
  const pathname = usePathname();

  return (
    <div className="relative">
      {!ready && (
        <div aria-hidden="true" className="absolute inset-0 z-20 overflow-hidden bg-admin-bg">
          <PageSkeleton pathname={pathname} />
        </div>
      )}
      {children}
    </div>
  );
}
