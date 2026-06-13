import { notFound } from 'next/navigation';
import { Heading } from '@/components/admin/heading';
import { prisma } from '@/lib/prisma-client';
import { ProductForm, type ProductFormInitial } from '../../_components/product-form';
import type { ProductValues } from '@/services/dto/product.dto';

export const metadata = { title: 'Редактирование товара' };
export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, brandRows] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        colorways: {
          orderBy: { sortOrder: 'asc' },
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            variants: { orderBy: { sizeEu: 'asc' }, include: { _count: { select: { orderItems: true } } } },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.product.findMany({ distinct: ['brand'], orderBy: { brand: 'asc' }, select: { brand: true } }),
  ]);
  if (!product) notFound();

  const specsObj = (product.specs ?? {}) as Record<string, string>;
  const referencedVariantIds: string[] = [];

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    gender: product.gender,
    categoryId: product.categoryId,
    description: product.description ?? '',
    fitNote: product.fitNote ?? '',
    specs: Object.entries(specsObj).map(([key, value]) => ({ key, value: String(value) })),
    isBestseller: product.isBestseller,
    active: product.active,
    sortOrder: product.sortOrder,
    colorways: product.colorways.map((c): ProductValues['colorways'][number] => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      swatchHex: c.swatchHex ?? undefined,
      isDefault: c.isDefault,
      images: c.images.map((im) => ({ url: im.url, publicId: im.publicId ?? undefined, alt: im.alt ?? undefined })),
      variants: c.variants.map((v) => {
        if (v._count.orderItems > 0) referencedVariantIds.push(v.id);
        return {
          id: v.id,
          sizeEu: Number(v.sizeEu),
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          active: v.active,
        };
      }),
    })),
  };

  return (
    <div className="space-y-6">
      <Heading title="Редактирование товара" description={product.name} />
      <ProductForm initial={initial} categories={categories} brands={brandRows.map((b) => b.brand)} referencedVariantIds={referencedVariantIds} />
    </div>
  );
}
