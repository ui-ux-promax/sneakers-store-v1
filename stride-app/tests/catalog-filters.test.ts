import { describe, it, expect } from 'vitest';
import { parseCatalogParams, buildProductWhere, buildOrderBy } from '@/lib/catalog-filters';

describe('parseCatalogParams', () => {
  it('дефолты при пустом вводе', () => {
    const p = parseCatalogParams({});
    expect(p.page).toBe(1);
    expect(p.sort).toBe('new');
    expect(p.categories).toEqual([]);
    expect(p.sizes).toEqual([]);
    expect(p.inStock).toBe(false);
  });
  it('парсит CSV-списки, цену, флаги', () => {
    const p = parseCatalogParams({
      category: 'running,lifestyle',
      size: '42,42.5',
      color: 'lime,black',
      brand: 'Nike',
      gender: 'MEN',
      priceFrom: '8000',
      priceTo: '16000',
      inStock: '1',
      sort: 'price-asc',
      page: '3',
      q: 'trail',
    });
    expect(p.categories).toEqual(['running', 'lifestyle']);
    expect(p.sizes).toEqual(['42', '42.5']);
    expect(p.colors).toEqual(['lime', 'black']);
    expect(p.brands).toEqual(['Nike']);
    expect(p.genders).toEqual(['MEN']);
    expect(p.priceFrom).toBe(8000);
    expect(p.priceTo).toBe(16000);
    expect(p.inStock).toBe(true);
    expect(p.sort).toBe('price-asc');
    expect(p.page).toBe(3);
    expect(p.query).toBe('trail');
  });
  it('некорректная сортировка/страница → дефолт', () => {
    const p = parseCatalogParams({ sort: 'bogus', page: '0' });
    expect(p.sort).toBe('new');
    expect(p.page).toBe(1);
  });
});

describe('buildProductWhere', () => {
  it('базовый инвариант — только active', () => {
    const where = buildProductWhere(parseCatalogParams({}));
    expect(where).toEqual({ active: true });
  });
  it('категория/бренд/gender — прямые фильтры; размер/цвет/цена/инсток — через colorways.variants', () => {
    const where = buildProductWhere(parseCatalogParams({
      category: 'running', brand: 'Nike', gender: 'MEN',
      size: '42', color: 'lime', priceFrom: '8000', priceTo: '16000', inStock: '1',
    }));
    expect(where.active).toBe(true);
    expect(where.category).toEqual({ slug: { in: ['running'] } });
    expect(where.brand).toEqual({ in: ['Nike'] });
    expect(where.gender).toEqual({ in: ['MEN'] });
    // colorways.some.variants.some с ценой/размером/active+stock, и colorways.some.slug для цвета
    expect(where.colorways).toBeDefined();
  });
  it('поиск по имени — insensitive contains', () => {
    const where = buildProductWhere(parseCatalogParams({ q: 'trail' }));
    expect(where.name).toEqual({ contains: 'trail', mode: 'insensitive' });
  });
});

describe('buildOrderBy', () => {
  it('маппит сортировки', () => {
    expect(buildOrderBy('new')).toEqual([{ createdAt: 'desc' }, { sortOrder: 'asc' }]);
    expect(buildOrderBy('popular')).toEqual([{ isBestseller: 'desc' }, { sortOrder: 'asc' }]);
    expect(buildOrderBy('price-asc')).toBeDefined();
    expect(buildOrderBy('price-desc')).toBeDefined();
    expect(buildOrderBy('discount')).toBeDefined();
  });
});
