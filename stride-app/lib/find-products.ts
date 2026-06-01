import { prisma } from '@/lib/prisma-client';
import { buildProductWhere, parseCatalogParams, PAGE_SIZE, type RawSearchParams } from '@/lib/catalog-filters';
import { productCardInclude, buildProductCardData, type ProductCardData, type ProductForCard } from '@/lib/product-summary';
import { discountPercent } from '@/lib/product-badges';
import { NEW_PRODUCT_WINDOW_DAYS, LOW_STOCK_THRESHOLD, GENDER_OPTIONS } from '@/constants/config';

export interface Facet { value: string; label: string; count: number; }
export interface CatalogResult {
  products: ProductCardData[];
  total: number;
  page: number;
  totalPages: number;
  facets: {
    categories: Facet[];
    brands: Facet[];
    genders: Facet[];
    colors: { slug: string; name: string; swatchHex: string | null }[];
  };
}

function sortCards(items: { data: ProductCardData; raw: ProductForCard }[], sort: string) {
  const by = [...items];
  switch (sort) {
    case 'popular':
      by.sort((a, b) => Number(b.raw.isBestseller) - Number(a.raw.isBestseller) || a.raw.sortOrder - b.raw.sortOrder);
      break;
    case 'price-asc':
      by.sort((a, b) => a.data.minPrice - b.data.minPrice);
      break;
    case 'price-desc':
      by.sort((a, b) => b.data.minPrice - a.data.minPrice);
      break;
    case 'discount':
      by.sort((a, b) => (discountPercent(b.data.minPrice, b.data.minCompareAtPrice) ?? 0) - (discountPercent(a.data.minPrice, a.data.minCompareAtPrice) ?? 0));
      break;
    case 'new':
    default:
      by.sort((a, b) => b.raw.createdAt.getTime() - a.raw.createdAt.getTime());
  }
  return by;
}

// Фаза 1: каталог небольшой — грузим все совпадения, сортируем/пагинируем в памяти (корректно
// для сортировки по цене/скидке между страницами). Для крупного каталога вынести в DB-уровень.
export async function findProducts(sp: RawSearchParams): Promise<CatalogResult> {
  const params = parseCatalogParams(sp);
  const where = buildProductWhere(params);
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };

  const [raw, categories, catCounts, brandCounts, genderCounts, colorRows] = await Promise.all([
    prisma.product.findMany({ where, include: productCardInclude }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['brand'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['gender'], where, _count: { _all: true } }),
    prisma.productColorway.findMany({ where: { product: { active: true } }, distinct: ['slug'], select: { slug: true, name: true, swatchHex: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  const cards = sortCards(raw.map((p) => ({ data: buildProductCardData(p, now, cfg), raw: p })), params.sort);
  const total = cards.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const products = cards.slice(start, start + PAGE_SIZE).map((c) => c.data);

  const catCountMap = new Map(catCounts.map((c) => [c.categoryId, c._count._all]));
  const genderCountMap = new Map(genderCounts.map((g) => [g.gender, g._count._all]));

  return {
    products,
    total,
    page,
    totalPages,
    facets: {
      categories: categories.map((c) => ({ value: c.slug, label: c.name, count: catCountMap.get(c.id) ?? 0 })),
      brands: brandCounts.map((b) => ({ value: b.brand, label: b.brand, count: b._count._all })).sort((a, b) => a.label.localeCompare(b.label)),
      genders: GENDER_OPTIONS.map((g) => ({ value: g.value, label: g.label, count: genderCountMap.get(g.value) ?? 0 })).filter((g) => g.count > 0),
      colors: colorRows,
    },
  };
}
