import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn), // нет DSN → Sentry выключен (fail-open, как rate-limit)
  tracesSampleRate: 0,   // errors-only: трейсинг выключен
  sendDefaultPii: false, // не слать cookies/headers/ip по умолчанию
});
