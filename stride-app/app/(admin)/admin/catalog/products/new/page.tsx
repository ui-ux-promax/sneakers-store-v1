import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { ProductForm } from '../_components/product-form';

export const metadata = { title: 'Новый товар' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const [categories, brandRows] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
  ]);
  return (
    <div className="space-y-6">
      <Heading title="Новый товар" description="Создание товара каталога" />
      <ProductForm categories={categories} brands={brandRows.map((b) => b.brand)} />
    </div>
  );
}
