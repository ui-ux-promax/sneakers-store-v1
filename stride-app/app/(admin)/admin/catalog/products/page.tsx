import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Button } from '@/components/admin/ui/button';
import { Icon } from '@/components/admin/icon';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { GENDER_VALUES } from '@/services/dto/product.dto';
import { formatPrice } from '@/lib/format';
import { formatAddedAgo } from '@/lib/relative-time';
import { ProductFilters } from './_components/product-filters';
import { ProductTable, type ProductRow } from './_components/product-table';
import { ViewToggle } from './_components/view-toggle';

export const metadata = { title: 'Товары' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

const LOW_STOCK_TOTAL = 200; // порог для подписи «Здоровый/Низкий» на карточке остатка

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const brand = readEnumParam(sp, 'brand', await brandValues());
  const gender = readEnumParam(sp, 'gender', GENDER_VALUES);
  const categoryId = typeof sp.category === 'string' ? sp.category : undefined;
  const status = readEnumParam(sp, 'status', ['active', 'inactive'] as const);
  const view = sp.view === 'recent' ? 'recent' : 'all';

  const where: Prisma.ProductWhereInput = {
    ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
    ...(brand ? { brand } : {}),
    ...(gender ? { gender } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { colorways: { some: { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    view === 'recent' ? [{ createdAt: 'desc' }] : [{ sortOrder: 'asc' }, { createdAt: 'desc' }];

  const [total, products, categories, brandList, stockAgg, topBrandRows, salesAgg] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true, name: true, brand: true, minPrice: true, discountPct: true, active: true, createdAt: true,
        category: { select: { name: true } },
        colorways: {
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
            variants: { select: { stock: true } },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
    // Bento: суммарный сток активных товаров
    prisma.productVariant.aggregate({ _sum: { stock: true }, where: { colorway: { product: { active: true } } } }),
    // Bento: бренд-лидер по salesCount
    prisma.product.groupBy({ by: ['brand'], _sum: { salesCount: true }, orderBy: { _sum: { salesCount: 'desc' } }, take: 1 }),
    // Bento: объём продаж = сумма позиций всех заказов
    prisma.orderItem.aggregate({ _sum: { lineTotal: true } }),
  ]);

  const meta = buildPaginationMeta({ page, limit }, total);
  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    categoryName: p.category.name,
    coverImage: p.colorways[0]?.images[0]?.url ?? null,
    minPrice: p.minPrice,
    discountPct: p.discountPct,
    totalStock: p.colorways.reduce((s, c) => s + c.variants.reduce((a, v) => a + v.stock, 0), 0),
    active: p.active,
    addedAgo: formatAddedAgo(p.createdAt),
  }));

  const stockTotal = stockAgg._sum.stock ?? 0;
  const topBrand = topBrandRows[0]?.brand ?? '—';
  const salesValue = salesAgg._sum.lineTotal ?? 0;

  return (
    <div className="space-y-8">
      {/* Заголовок */}
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div>
          <h2 className="font-admin-head text-3xl font-bold text-admin-on-surface mb-1">Товары ({total})</h2>
          <p className="text-admin-on-surface-variant">Управление каталогом и статусом отображения товаров.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle />
          <Button asChild>
            <Link href="/admin/catalog/products/new">
              <Icon name="add" className="text-[18px]" /> Добавить товар
            </Link>
          </Button>
        </div>
      </div>

      <ProductFilters options={{ brands: brandList.map((b) => b.brand), categories }} />

      {rows.length > 0 ? (
        <ProductTable rows={rows} page={meta.page} totalPages={meta.totalPages} total={total} limit={limit} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Товары не найдены.
        </div>
      )}

      {/* Bento-метрики */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon="trending_up" label="Объём продаж" value={formatPrice(salesValue)} />
        <StatCard
          icon="inventory_2"
          label="Текущий остаток"
          value={stockTotal.toLocaleString('ru-RU')}
          tag={stockTotal >= LOW_STOCK_TOTAL ? 'Здоровый' : 'Низкий'}
        />
        <StatCard icon="workspace_premium" label="Лидер продаж" value={topBrand} tag="Топ-бренд" />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tag }: { icon: string; label: string; value: string; tag?: string }) {
  return (
    <div className="bg-admin-surface p-6 rounded-xl border border-admin-outline-variant hover:border-admin-primary transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 rounded-lg bg-admin-surface-high flex items-center justify-center group-hover:bg-admin-primary transition-colors">
          <Icon name={icon} className="text-admin-on-surface-variant group-hover:text-admin-on-primary" />
        </div>
        {tag && <span className="text-admin-on-surface-variant font-bold text-xs">{tag}</span>}
      </div>
      <p className="text-xs text-admin-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
      <h3 className="font-admin-head text-2xl font-bold text-admin-on-surface">{value}</h3>
    </div>
  );
}

// distinct-бренды как readonly-кортеж для readEnumParam (валидация значения фильтра).
async function brandValues(): Promise<readonly string[]> {
  const rows = await prisma.product.findMany({ distinct: ['brand'], select: { brand: true } });
  return rows.map((r) => r.brand);
}
