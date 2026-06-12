/**
 * /admin/* — Индикатор загрузки для всего admin-сегмента (Suspense boundary).
 * Используется при серверных переходах между страницами.
 */

import { Loader2 } from 'lucide-react';

export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2
        className="h-8 w-8 animate-spin text-admin-on-surface-variant"
        aria-label="Загрузка..."
      />
    </div>
  );
}
