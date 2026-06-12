import { describe, it, expect } from 'vitest';
import {
  parsePaginationParams,
  buildPaginationMeta,
  readSearchQuery,
  readEnumParam,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '@/lib/admin/pagination';

// ---------------------------------------------------------------------------
// parsePaginationParams
// ---------------------------------------------------------------------------
describe('parsePaginationParams', () => {
  it('пустые params → defaults { page:1, limit:20, skip:0 }', () => {
    expect(parsePaginationParams(undefined)).toEqual({
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      skip: 0,
    });
  });

  it('пустой объект → defaults', () => {
    expect(parsePaginationParams({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('page < 1 зажимается до 1', () => {
    const result = parsePaginationParams({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('отрицательный page зажимается до 1', () => {
    const result = parsePaginationParams({ page: '-5' });
    expect(result.page).toBe(1);
  });

  it('limit > MAX_LIMIT зажимается до 200', () => {
    const result = parsePaginationParams({ limit: '9999' });
    expect(result.limit).toBe(MAX_LIMIT);
    expect(result.limit).toBe(200);
  });

  it('limit < 1 зажимается до 1', () => {
    const result = parsePaginationParams({ limit: '0' });
    expect(result.limit).toBe(1);
  });

  it('корректный skip: page=3, limit=10 → skip=20', () => {
    const result = parsePaginationParams({ page: '3', limit: '10' });
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('принимает URLSearchParams', () => {
    const sp = new URLSearchParams({ page: '2', limit: '5' });
    const result = parsePaginationParams(sp);
    expect(result).toEqual({ page: 2, limit: 5, skip: 5 });
  });

  it('принимает plain object', () => {
    const result = parsePaginationParams({ page: '4', limit: '25' });
    expect(result).toEqual({ page: 4, limit: 25, skip: 75 });
  });

  it('кастомный limit по умолчанию через defaults.limit', () => {
    const result = parsePaginationParams(undefined, { limit: 50 });
    expect(result.limit).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// buildPaginationMeta
// ---------------------------------------------------------------------------
describe('buildPaginationMeta', () => {
  it('total=0 → totalPages=0', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 0);
    expect(meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('total=25, limit=10 → totalPages=3', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 10 }, 25);
    expect(meta.totalPages).toBe(3);
  });

  it('total=20, limit=10 → totalPages=2 (ровное деление)', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 10 }, 20);
    expect(meta.totalPages).toBe(2);
  });

  it('total=1, limit=20 → totalPages=1', () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 1);
    expect(meta.totalPages).toBe(1);
  });

  it('сохраняет page и limit из input', () => {
    const meta = buildPaginationMeta({ page: 3, limit: 15 }, 60);
    expect(meta.page).toBe(3);
    expect(meta.limit).toBe(15);
    expect(meta.total).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// readSearchQuery
// ---------------------------------------------------------------------------
describe('readSearchQuery', () => {
  it('отсутствует → пустая строка', () => {
    expect(readSearchQuery(undefined)).toBe('');
    expect(readSearchQuery({})).toBe('');
  });

  it('обрезает пробелы', () => {
    expect(readSearchQuery({ q: '  nike  ' })).toBe('nike');
  });

  it('возвращает непустую строку', () => {
    expect(readSearchQuery({ q: 'adidas' })).toBe('adidas');
  });

  it('принимает URLSearchParams', () => {
    const sp = new URLSearchParams({ q: '  puma  ' });
    expect(readSearchQuery(sp)).toBe('puma');
  });

  it('пустая строка → пустая строка', () => {
    expect(readSearchQuery({ q: '' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// readEnumParam
// ---------------------------------------------------------------------------
describe('readEnumParam', () => {
  const allowed = ['ACTIVE', 'INACTIVE', 'PENDING'] as const;

  it('значение из списка → возвращает его', () => {
    expect(readEnumParam({ status: 'ACTIVE' }, 'status', allowed)).toBe('ACTIVE');
  });

  it('значение не из списка → undefined', () => {
    expect(readEnumParam({ status: 'UNKNOWN' }, 'status', allowed)).toBeUndefined();
  });

  it('параметр отсутствует → undefined', () => {
    expect(readEnumParam({}, 'status', allowed)).toBeUndefined();
  });

  it('undefined searchParams → undefined', () => {
    expect(readEnumParam(undefined, 'status', allowed)).toBeUndefined();
  });

  it('принимает URLSearchParams', () => {
    const sp = new URLSearchParams({ status: 'PENDING' });
    expect(readEnumParam(sp, 'status', allowed)).toBe('PENDING');
  });
});
