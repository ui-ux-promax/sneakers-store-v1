import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// Neon WebSocket-транспорт: постоянный сокет поверх @neondatabase/serverless (Pool).
// В ОТЛИЧИЕ от HTTP-режима поддерживает $transaction / createMany / nested-create.
// Connection string — POOLED (эндпоинт -pooler); миграции (db push) используют directUrl/NON_POOLING.
// Транзиентные обрывы постоянного сокета («Connection terminated», «socket hang up») поглощает
// retryOnTransient ниже.
neonConfig.webSocketConstructor = ws;

const getConnectionString = () =>
  process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;

const buildAdapter = () => {
  const connectionString = getConnectionString();
  if (!connectionString) return undefined;
  return new PrismaNeon({ connectionString });
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

const retryOnTransient = async <T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> => {
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
