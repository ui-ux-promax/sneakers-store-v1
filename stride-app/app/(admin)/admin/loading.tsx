/**
 * /admin — Скелетон дашборда (Suspense-фоллбэк). Ловит только сам /admin:
 * у дочерних разделов есть свои loading.tsx с собственной геометрией.
 */
import { DashboardSkeleton } from '@/components/admin/skeleton';

export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
