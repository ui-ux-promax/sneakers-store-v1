// Edge-рантайм (middleware/edge-роуты). Edge-совместимый Sentry SDK; Node-API не тянуть.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
