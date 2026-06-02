import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';

export const productDetailInclude = {
  category: { select: { name: true, slug: true } },
  colorways: {
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }],
    include: {
      images: { orderBy: { sortOrder: 'asc' as const } },
      variants: { orderBy: { sizeEu: 'asc' as const } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export function getProductBySlug(slug: string) {
  return prisma.product.findFirst({ where: { slug, active: true }, include: productDetailInclude });
}
