import { prisma } from '@/lib/prisma-client';

export function isValidRating(r: number): boolean {
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

// Право оставить отзыв: есть не-CANCELLED заказ с этим товаром И ещё не оставлял отзыв.
export async function canReview(userId: string, productId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      items: { some: { productVariant: { colorway: { productId } } } },
    },
    select: { id: true },
  });
  if (!order) return false;
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  return !existing;
}
