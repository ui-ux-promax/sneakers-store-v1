import { prisma } from '@/lib/prisma-client';
import { buildProductWhere, buildOrderBy, buildPagination, parseCatalogParams, PAGE_SIZE, type RawSearchParams } from '@/lib/catalog-filters';
import { productCardInclude, buildProductCardData, type ProductCardData } from '@/lib/product-summary';
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
    price: { min: number; max: number };
  };
}

// Сортировка/пагинация на уровне БД: orderBy по денормализованным колонкам (см. buildOrderBy)
// + skip/take + count. minPrice/discountPct/createdAt/salesCount — колонки Product, поэтому
// порядок и срез страницы делает Postgres, а не память (тянем только PAGE_SIZE карточек).
export async function findProducts(sp: RawSearchParams): Promise<CatalogResult> {
  const params = parseCatalogParams(sp);
  const where = buildProductWhere(params);
  const now = new Date();
  const cfg = { newWindowDays: NEW_PRODUCT_WINDOW_DAYS, lowStock: LOW_STOCK_THRESHOLD };

  // total + фасеты не зависят от страницы — считаем параллельно, ПОТОМ клампим page и тянем срез
  // (skip от валидной страницы → нет промаха в пустую выборку при page вне диапазона).
  const [total, categories, catCounts, brandCounts, genderCounts, colorRows, priceAgg] = await Promise.all([
    prisma.product.count({ where }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['brand'], where, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['gender'], where, _count: { _all: true } }),
    prisma.productColorway.findMany({ where: { product: { active: true } }, distinct: ['slug'], select: { slug: true, name: true, swatchHex: true }, orderBy: { sortOrder: 'asc' } }),
    // Границы цены для слайдера: весь активный каталог (mirror active-scoping расцветок выше),
    // не сужаем текущими фильтрами — ручки всегда показывают полный диапазон БД.
    prisma.productVariant.aggregate({ where: { active: true, colorway: { product: { active: true } } }, _min: { price: true }, _max: { price: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, totalPages);
  const raw = await prisma.product.findMany({
    where,
    include: productCardInclude,
    orderBy: buildOrderBy(params.sort),
    ...buildPagination(page),
  });
  const products = raw.map((p) => buildProductCardData(p, now, cfg));

  const catCountMap = new Map(catCounts.map((c) => [c.categoryId, c._count._all]));
  const genderCountMap = new Map(genderCounts.map((g) => [g.gender, g._count._all]));

  // Пустой каталог → min/max null; отдаём 0..0, слайдер в этом случае не рендерится (min>=max).
  const priceMin = priceAgg._min.price ?? 0;
  const priceMax = priceAgg._max.price ?? 0;

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
      price: { min: priceMin, max: priceMax },
    },
  };
}
