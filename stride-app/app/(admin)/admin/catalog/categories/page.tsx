/**
 * /admin/catalog — Категории каталога (Phase 3.2).
 * Список + reorder + ссылки на создание/редактирование. Товары (Product CRUD) — Phase 3.3.
 */

import Link from 'next/link';
import { Heading } from '@/components/admin/heading';
import { Button } from '@/components/admin/ui/button';
import { prisma } from '@/lib/prisma-client';
import { CategoryTable, type CategoryRow } from './_components/category-table';

export const metadata = { title: 'Категории' };
export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      tagline: true,
      coverImage: true,
      _count: { select: { products: true } },
    },
  });

  const rows: CategoryRow[] = categories.map(({ _count, ...c }) => ({
    ...c,
    productCount: _count.products,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Heading title="Категории" description="Управление категориями каталога" />
        <Button asChild>
          <Link href="/admin/catalog/categories/new">Добавить категорию</Link>
        </Button>
      </div>
      {rows.length > 0 ? (
        <CategoryTable rows={rows} />
      ) : (
        <div className="bg-admin-surface border border-admin-outline-variant rounded-xl p-8 text-admin-on-surface-variant text-sm">
          Категорий пока нет. Нажмите «Добавить категорию».
        </div>
      )}
    </div>
  );
}
