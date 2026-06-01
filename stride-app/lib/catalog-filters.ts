import type { Prisma } from '@prisma/client';
import { CATALOG_PAGE_SIZE, DEFAULT_SORT, SORT_OPTIONS, type SortValue } from '@/constants/config';

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface CatalogParams {
  categories: string[]; // slugs
  sizes: string[];      // '42','42.5'
  colors: string[];     // colorway slugs
  brands: string[];
  genders: string[];    // 'MEN'...
  priceFrom?: number;
  priceTo?: number;
  inStock: boolean;
  sort: SortValue;
  page: number;
  query?: string;
}

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const csv = (v: string | string[] | undefined): string[] => {
  const s = first(v);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

const SORT_VALUES = SORT_OPTIONS.map((o) => o.value) as readonly string[];

export function parseCatalogParams(sp: RawSearchParams): CatalogParams {
  const sortRaw = first(sp.sort);
  const sort: SortValue = (SORT_VALUES.includes(sortRaw ?? '') ? sortRaw : DEFAULT_SORT) as SortValue;

  const pageNum = Number(first(sp.page));
  const page = Number.isInteger(pageNum) && pageNum > 1 ? pageNum : 1;

  const priceFromNum = Number(first(sp.priceFrom));
  const priceToNum = Number(first(sp.priceTo));

  return {
    categories: csv(sp.category),
    sizes: csv(sp.size),
    colors: csv(sp.color),
    brands: csv(sp.brand),
    genders: csv(sp.gender),
    priceFrom: Number.isFinite(priceFromNum) && priceFromNum > 0 ? priceFromNum : undefined,
    priceTo: Number.isFinite(priceToNum) && priceToNum > 0 ? priceToNum : undefined,
    inStock: first(sp.inStock) === '1' || first(sp.inStock) === 'true',
    sort,
    page,
    query: first(sp.q)?.trim() || undefined,
  };
}

// where для активного варианта (цена/размер/доступность) — переиспользуется в include.
function variantWhere(p: CatalogParams): Prisma.ProductVariantWhereInput {
  const price: Prisma.IntFilter = {};
  if (p.priceFrom !== undefined) price.gte = p.priceFrom;
  if (p.priceTo !== undefined) price.lte = p.priceTo;
  const w: Prisma.ProductVariantWhereInput = { active: true };
  if (Object.keys(price).length) w.price = price;
  if (p.sizes.length) w.sizeEu = { in: p.sizes };
  if (p.inStock) w.stock = { gt: 0 };
  return w;
}

export function buildProductWhere(p: CatalogParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { active: true };

  if (p.categories.length) where.category = { slug: { in: p.categories } };
  if (p.brands.length) where.brand = { in: p.brands };
  if (p.genders.length) where.gender = { in: p.genders as Prisma.EnumGenderFilter['in'] };
  if (p.query) where.name = { contains: p.query, mode: 'insensitive' };

  // Фильтры на уровне расцветок/вариантов: цвет — slug расцветки; размер/цена/инсток — её варианты.
  const colorwaySome: Prisma.ProductColorwayWhereInput = {};
  if (p.colors.length) colorwaySome.slug = { in: p.colors };
  const vWhere = variantWhere(p);
  const hasVariantFilter = p.sizes.length || p.priceFrom !== undefined || p.priceTo !== undefined || p.inStock;
  if (hasVariantFilter) colorwaySome.variants = { some: vWhere };
  if (Object.keys(colorwaySome).length) where.colorways = { some: colorwaySome };

  return where;
}

export function buildOrderBy(sort: SortValue): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'popular':
      return [{ isBestseller: 'desc' }, { sortOrder: 'asc' }];
    case 'price-asc':
      // Цена живёт в вариантах; для сортировки по цене на уровне Product используем sortOrder как прокси
      // + точную сортировку делаем в find-products по агрегированной minPrice (см. Задача 15).
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'price-desc':
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'discount':
      return [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
    case 'new':
    default:
      return [{ createdAt: 'desc' }, { sortOrder: 'asc' }];
  }
}

export const PAGE_SIZE = CATALOG_PAGE_SIZE;

export function buildPagination(page: number) {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}
