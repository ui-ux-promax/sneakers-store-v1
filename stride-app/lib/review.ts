import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';

export function isValidRating(r: number): boolean {
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

export type ReviewEligibility = 'eligible' | 'not-purchased' | 'already-reviewed';

// «Покупка», дающая право на отзыв: заказ с этим товаром, не отменённый, И либо COD
// (оплата при получении), либо онлайн с прошедшей оплатой. Неоплаченный онлайн-заказ
// («Ожидает оплаты» — ушёл с ЮKassa, не заплатил) покупкой НЕ считается.
function purchasedOrderWhere(userId: string, productId: string): Prisma.OrderWhereInput {
  return {
    userId,
    status: { not: 'CANCELLED' },
    items: { some: { productVariant: { colorway: { productId } } } },
    OR: [{ paymentMethod: 'cod' }, { payment: { is: { status: 'succeeded' } } }],
  };
}

// Состояние права на отзыв: есть ли покупка и не оставлял ли уже отзыв.
// Разводит «не покупал» и «уже оставил» — UI показывает разные сообщения.
export async function getReviewEligibility(userId: string, productId: string): Promise<ReviewEligibility> {
  const order = await prisma.order.findFirst({ where: purchasedOrderWhere(userId, productId), select: { id: true } });
  if (!order) return 'not-purchased';
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: { id: true },
  });
  return existing ? 'already-reviewed' : 'eligible';
}

// Серверный гейт submitReview: право оставить отзыв = eligible (есть покупка И ещё не оставлял).
export async function canReview(userId: string, productId: string): Promise<boolean> {
  return (await getReviewEligibility(userId, productId)) === 'eligible';
}

// При отмене заказа: снять отзывы пользователя на товары, по которым не осталось ни одной
// покупки (иначе осиротевший отзыв остаётся виден на PDP). Если есть другой квалифицирующий
// заказ на тот же товар — отзыв сохраняется.
export async function pruneReviewsAfterCancel(userId: string, productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    const stillPurchased = await prisma.order.findFirst({ where: purchasedOrderWhere(userId, productId), select: { id: true } });
    if (!stillPurchased) {
      await prisma.review.deleteMany({ where: { userId, productId } });
    }
  }
}
