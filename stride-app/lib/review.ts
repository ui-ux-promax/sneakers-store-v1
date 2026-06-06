import { prisma } from '@/lib/prisma-client';

export function isValidRating(r: number): boolean {
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

export type ReviewEligibility = 'eligible' | 'not-purchased' | 'already-reviewed';

// Состояние права на отзыв: купил ли (не-CANCELLED заказ с этим товаром) и не оставлял ли уже.
// Разводит «не покупал» и «уже оставил» — UI показывает разные сообщения.
export async function getReviewEligibility(userId: string, productId: string): Promise<ReviewEligibility> {
  const order = await prisma.order.findFirst({
    where: {
      userId,
      status: { not: 'CANCELLED' },
      items: { some: { productVariant: { colorway: { productId } } } },
    },
    select: { id: true },
  });
  if (!order) return 'not-purchased';
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  return existing ? 'already-reviewed' : 'eligible';
}

// Серверный гейт submitReview: право оставить отзыв = eligible (купил И ещё не оставлял).
export async function canReview(userId: string, productId: string): Promise<boolean> {
  return (await getReviewEligibility(userId, productId)) === 'eligible';
}
