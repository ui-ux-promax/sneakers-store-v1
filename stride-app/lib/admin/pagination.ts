/**
 * Helpers for URL-driven server pagination on admin list pages.
 *
 * The convention across paginated routes:
 *   - `page`  — 1-based page number (default 1, clamped to >= 1).
 *   - `limit` — page size (default 20, clamped to [1, 200]).
 *   - `q`     — free-text search (default '').
 *
 * Returns `skip` derived from `page` and `limit` so callers can pass
 * `{ take, skip }` directly to Prisma's `findMany`.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 200;

export type PaginationInput = {
  page: number;
  limit: number;
  skip: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const toInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return fallback;
};

const toString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
};

type RawSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

const readParam = (
  searchParams: RawSearchParams,
  key: string,
): string | undefined => {
  if (!searchParams) return undefined;
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }
  return toString(searchParams[key]);
};

export const parsePaginationParams = (
  searchParams: RawSearchParams,
  defaults?: { limit?: number },
): PaginationInput => {
  const limitDefault = defaults?.limit ?? DEFAULT_LIMIT;
  const rawPage = toInt(readParam(searchParams, 'page'), DEFAULT_PAGE);
  const rawLimit = toInt(readParam(searchParams, 'limit'), limitDefault);

  const page = Math.max(1, rawPage);
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPaginationMeta = (
  input: Pick<PaginationInput, 'page' | 'limit'>,
  total: number,
): PaginationMeta => ({
  page: input.page,
  limit: input.limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
});

export const readSearchQuery = (searchParams: RawSearchParams): string => {
  const raw = readParam(searchParams, 'q');
  return raw ? raw.trim() : '';
};

export const readEnumParam = <T extends string>(
  searchParams: RawSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined => {
  const raw = readParam(searchParams, key);
  if (!raw) return undefined;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
};
