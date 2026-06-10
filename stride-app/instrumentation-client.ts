import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0, // errors-only: ни performance, ни replay
});

// App Router navigation tracing hook (нужен экспорт даже при tracing=0; вреда нет).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
