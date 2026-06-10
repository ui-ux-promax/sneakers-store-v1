'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="font-sans">
        <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="font-display text-2xl font-bold">Что-то пошло не так</h1>
          <p className="text-ink-muted text-sm max-w-md">
            Мы уже знаем о проблеме. Попробуйте обновить страницу.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--color-text))] px-6 py-3 text-sm font-semibold text-white"
          >
            Попробовать снова
          </button>
        </main>
      </body>
    </html>
  );
}
