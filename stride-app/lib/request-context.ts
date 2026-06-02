export interface RequestContext {
  requestId: string;
}

type AsyncLocalStorageLike<T> = {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

const storage = createStorage();

function createStorage(): AsyncLocalStorageLike<RequestContext> | null {
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME !== 'nodejs') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-eval
    const requireFn = eval('require') as NodeJS.Require;
    const { AsyncLocalStorage } = requireFn('node:async_hooks') as typeof import('node:async_hooks');
    return new AsyncLocalStorage<RequestContext>();
  } catch {
    return null;
  }
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type HeadersLike = { get(name: string): string | null };

function extractIncomingRequestId(headers: HeadersLike | undefined): string | null {
  if (!headers || typeof headers.get !== 'function') return null;
  const value = headers.get('x-request-id');
  return value && value.length > 0 ? value : null;
}

export function getRequestId(): string | undefined {
  return storage?.getStore()?.requestId;
}

export async function runWithRequestContext<T>(
  source: { headers?: HeadersLike } | Request | undefined,
  handler: () => Promise<T> | T,
): Promise<T> {
  const headers = source && 'headers' in source ? (source.headers as HeadersLike | undefined) : undefined;
  const requestId = extractIncomingRequestId(headers) ?? generateRequestId();
  if (!storage) return handler();
  return storage.run({ requestId }, async () => handler());
}
