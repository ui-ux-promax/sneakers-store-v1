'use client';

/**
 * /admin/* — Segment-level error boundary (не заменяет global-error.tsx).
 * Перехватывает ошибки рендера внутри admin-сегмента, логирует в Sentry,
 * показывает русскоязычную карточку с кнопкой повтора.
 */

import { useEffect } from 'react';
import { Button } from '@/components/admin/ui/button';

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    // Динамический импорт, чтобы не тянуть Sentry в бандл при отсутствии ошибок
    import('@sentry/nextjs').then((S) => S.captureException(error));
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <p className="text-xl font-admin-head font-bold text-admin-on-surface">
          Что-то пошло не так
        </p>
        <p className="text-sm text-admin-on-surface-variant">
          Произошла ошибка при загрузке страницы. Мы уже знаем о проблеме.
          {error.digest && (
            <span className="block mt-1 font-mono text-xs opacity-60">
              digest: {error.digest}
            </span>
          )}
        </p>
        <Button variant="primary" onClick={reset}>
          Повторить
        </Button>
      </div>
    </div>
  );
}
