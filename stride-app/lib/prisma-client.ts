import { PrismaNeonHTTP } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaClient } from '@prisma/client';

// Neon HTTP-транспорт: каждый запрос — отдельный HTTPS-вызов (нет пула/идл-дисконнектов,
// работает в dev/node/edge). ВАЖНО: $transaction НЕ поддерживается в HTTP-режиме —
// мультизаписи делать последовательными await с ручной компенсацией.

const getConnectionString = () =>
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

const getNeonFetchTimeoutMs = () => {
  const value = Number(process.env.NEON_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 15000;
};

const NEON_FETCH_TIMEOUT_MS = getNeonFetchTimeoutMs();

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const parentSignal = init?.signal;
  const timeout = setTimeout(() => controller.abort(), NEON_FETCH_TIMEOUT_MS);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  try {
    const requestInit: RequestInit = init
      ? { ...init, signal: controller.signal }
      : { signal: controller.signal };
    return await fetch(input, requestInit);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};

neonConfig.fetchFunction = fetchWithTimeout;

const buildAdapter = () => {
  const url = getConnectionString();
  if (!url) return undefined;
  return new PrismaNeonHTTP(url, {});
};

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  'ENETDOWN', 'ENETUNREACH', 'EHOSTUNREACH', 'ABORT_ERR',
]);
const TRANSIENT_MESSAGE_FRAGMENTS = [
  'fetch failed', 'Connection terminated', 'Server has closed the connection',
  'socket hang up', 'network error', 'AbortError', 'aborted',
];

const isTransientError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };
  if (typeof e.code === 'string' && TRANSIENT_ERROR_CODES.has(e.code)) return true;
  if (e.name === 'AbortError') return true;
  if (typeof e.message === 'string' && TRANSIENT_MESSAGE_FRAGMENTS.some((f) => (e.message as string).includes(f))) return true;
  if (e.cause) return isTransientError(e.cause);
  if (e.sourceError) return isTransientError(e.sourceError);
  return false;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const retryOnTransient = async <T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !isTransientError(err)) throw err;
      await sleep(100 * Math.pow(3, attempt - 1));
    }
  }
  throw lastError;
};

const prismaClientSingleton = () => {
  const adapter = buildAdapter();
  const baseClient = new PrismaClient({
    ...(adapter ? { adapter } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  return baseClient.$extends({
    name: 'retryOnTransient',
    query: { $allOperations({ args, query }) { return retryOnTransient(() => query(args)); } },
  });
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
