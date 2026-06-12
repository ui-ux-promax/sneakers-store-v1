import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { logger } from '@/lib/logger';

// Stride-конверт для JSON-ошибок: { message, issues? }.
// `issues` появляется только при валидационных ошибках (zod .flatten()),
// чтобы клиент мог подсветить конкретные поля формы.
type ApiErrorBody = { message: string; issues?: unknown };

/** JSON error response in stride's envelope: { message, issues? }. */
export function apiError(message: string, status: number, issues?: unknown) {
  const body: ApiErrorBody = { message };
  if (issues !== undefined) body.issues = issues;
  return NextResponse.json(body, { status });
}

/** 400 from a zod error → { message, issues: error.flatten() }. */
export function apiZodError(error: ZodError) {
  return apiError('Validation failed', 400, error.flatten());
}

/** 500 — логирует через stride logger (Sentry-мост + PII-скраб), возвращает generic body. */
export function apiInternalError(tag: string, err: unknown) {
  // logger.error(message, err?, fields?) — подпись из lib/logger.ts.
  logger.error(`admin_internal_error:${tag}`, err);
  return apiError('Internal error', 500);
}
