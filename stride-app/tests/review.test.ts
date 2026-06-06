import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma-client', () => ({
  prisma: {
    order: { findFirst: vi.fn() },
    review: { findUnique: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { isValidRating, canReview, getReviewEligibility, pruneReviewsAfterCancel } from '@/lib/review';
import { prisma } from '@/lib/prisma-client';

const orderFindFirst = prisma.order.findFirst as unknown as ReturnType<typeof vi.fn>;
const reviewFindUnique = prisma.review.findUnique as unknown as ReturnType<typeof vi.fn>;
const reviewDeleteMany = prisma.review.deleteMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('isValidRating', () => {
  it('1..5 целые → true', () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(3)).toBe(true);
  });
  it('вне диапазона / не целое → false', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(2.5)).toBe(false);
    expect(isValidRating(NaN)).toBe(false);
  });
});

describe('canReview', () => {
  it('есть не-CANCELLED заказ + нет отзыва → true', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue(null);
    expect(await canReview('u1', 'p1')).toBe(true);
  });
  it('нет заказа → false (и отзыв не проверяется)', async () => {
    orderFindFirst.mockResolvedValue(null);
    expect(await canReview('u1', 'p1')).toBe(false);
    expect(reviewFindUnique).not.toHaveBeenCalled();
  });
  it('есть заказ, но уже оставил отзыв → false', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue({ id: 'r1' });
    expect(await canReview('u1', 'p1')).toBe(false);
  });
});

describe('getReviewEligibility', () => {
  it('нет заказа → not-purchased (отзыв не проверяется)', async () => {
    orderFindFirst.mockResolvedValue(null);
    expect(await getReviewEligibility('u1', 'p1')).toBe('not-purchased');
    expect(reviewFindUnique).not.toHaveBeenCalled();
  });
  it('есть заказ + нет отзыва → eligible', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue(null);
    expect(await getReviewEligibility('u1', 'p1')).toBe('eligible');
    // «Покупка» = не-CANCELLED И (COD ИЛИ онлайн-оплата прошла) — неоплаченный онлайн не считается.
    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'CANCELLED' },
          OR: [{ paymentMethod: 'cod' }, { payment: { is: { status: 'succeeded' } } }],
        }),
      }),
    );
  });
  it('есть заказ + уже есть отзыв → already-reviewed', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o1' });
    reviewFindUnique.mockResolvedValue({ id: 'r1' });
    expect(await getReviewEligibility('u1', 'p1')).toBe('already-reviewed');
  });
});

describe('pruneReviewsAfterCancel', () => {
  it('не осталось квалифицирующего заказа → отзыв удаляется', async () => {
    orderFindFirst.mockResolvedValue(null);
    await pruneReviewsAfterCancel('u1', ['p1']);
    expect(reviewDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', productId: 'p1' } });
  });
  it('есть другой квалифицирующий заказ на тот же товар → отзыв сохраняется', async () => {
    orderFindFirst.mockResolvedValue({ id: 'o2' });
    await pruneReviewsAfterCancel('u1', ['p1']);
    expect(reviewDeleteMany).not.toHaveBeenCalled();
  });
  it('несколько товаров → удаляются только осиротевшие', async () => {
    orderFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'o3' });
    await pruneReviewsAfterCancel('u1', ['p1', 'p2']);
    expect(reviewDeleteMany).toHaveBeenCalledTimes(1);
    expect(reviewDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', productId: 'p1' } });
  });
});
