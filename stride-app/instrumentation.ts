import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Ловит ошибки серверных хендлеров/RSC (Next 15 + SDK >=8.28).
export const onRequestError = Sentry.captureRequestError;
