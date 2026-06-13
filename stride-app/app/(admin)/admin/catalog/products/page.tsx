import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Heading } from '@/components/admin/heading';
import { Button } from '@/components/admin/ui/button';
import { prisma } from '@/lib/prisma-client';
import { parsePaginationParams, buildPaginationMeta, readSearchQuery, readEnumParam } from '@/lib/admin/pagination';
import { GENDER_VALUES } from '@/services/dto/product.dto';
import { ProductFilters } from './_components/product-filters';
import { ProductTable, type ProductRow } from './_components/product-table';

export const metadata = { title: 'Товары' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { page, limit, skip } = parsePaginationParams(sp, { limit: 20 });
  const q = readSearchQuery(sp);
  const brand = readEnumParam(sp, 'brand', await brandValues());
  const gender = readEnumParam(sp, 'gender', GENDER_VALUES);
  const categoryId = typeof sp.category === 'string' ? sp.category : undefined;
  const status = readEnumParam(sp, 'status', ['active', 'inactive'] as const);

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

  const [total, products, categories, brandList] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true, name: true, brand: true, minPrice: true, active: true,
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
  ]);

  const meta = buildPaginationMeta({ page, limit }, total);
  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    categoryName: p.category.name,
    coverImage: p.colorways[0]?.images[0]?.url ?? null,
    minPrice: p.minPrice,
    totalStock: p.colorways.reduce((s, c) => s + c.variants.reduce((a, v) => a + v.stock, 0), 0),
    active: p.active,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Heading title="Товары" description="Управление товарами каталога" />
        <Button asChild>
          <Link href="/admin/catalog/products/new">Добавить товар</Link>
        </Button>
      </div>

      <ProductFilters options={{ brands: brandList.map((b) => b.brand), categories }} />

      {rows.length > 0 ? (
        <>
          <ProductTable rows={rows} />
          <Pagination page={meta.page} totalPages={meta.totalPages} sp={sp} />
        </>
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Товары не найдены.
        </div>
      )}
    </div>
  );
}

// distinct-бренды как readonly-кортеж для readEnumParam (валидация значения фильтра).
async function brandValues(): Promise<readonly string[]> {
  const rows = await prisma.product.findMany({ distinct: ['brand'], select: { brand: true } });
  return rows.map((r) => r.brand);
}

function Pagination({ page, totalPages, sp }: { page: number; totalPages: number; sp: SP }) {
  if (totalPages <= 1) return null;
  const mk = (next: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'page') params.set(k, v);
    params.set('page', String(next));
    return `/admin/catalog/products?${params.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-admin-on-surface-variant">
      <span>Стр. {page} из {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={mk(page - 1)} className="px-3 py-1.5 rounded-lg border border-admin-outline-variant hover:bg-admin-surface-high">Назад</Link>}
        {page < totalPages && <Link href={mk(page + 1)} className="px-3 py-1.5 rounded-lg border border-admin-outline-variant hover:bg-admin-surface-high">Вперёд</Link>}
      </div>
    </div>
  );
}
