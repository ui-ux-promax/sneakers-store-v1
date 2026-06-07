import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/review', () => ({
  canReview: vi.fn(),
  isValidRating: (r: number) => Number.isInteger(r) && r >= 1 && r <= 5,
}));
vi.mock('@/lib/prisma-client', () => ({ prisma: { review: { create: vi.fn() }, product: { findUnique: vi.fn() } } }));

import { submitReview } from '@/app/actions/review';
import { auth } from '@/auth';
import { canReview } from '@/lib/review';
import { prisma } from '@/lib/prisma-client';

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const canReviewMock = canReview as unknown as ReturnType<typeof vi.fn>;
const reviewCreate = prisma.review.create as unknown as ReturnType<typeof vi.fn>;
const productFindUnique = prisma.product.findUnique as unknown as ReturnType<typeof vi.fn>;

const valid = { productId: 'p1', rating: 5, body: 'Отличные' };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  canReviewMock.mockResolvedValue(true);
  reviewCreate.mockResolvedValue({ id: 'r1' });
  productFindUnique.mockResolvedValue({ slug: 'velocity-trail' });
});

describe('submitReview', () => {
  it('happy → review.create с rating/body, ok', async () => {
    const r = await submitReview(valid);
    expect(r).toEqual({ ok: true });
    const data = reviewCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ productId: 'p1', userId: 'u1', rating: 5, body: 'Отличные' });
  });
  it('не вошёл → отказ, без create', async () => {
    authMock.mockResolvedValue(null);
    const r = await submitReview(valid);
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('не покупал (canReview=false) → отказ, без create', async () => {
    canReviewMock.mockResolvedValue(false);
    const r = await submitReview(valid);
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('rating вне 1..5 → zod-отказ, без create', async () => {
    const r = await submitReview({ ...valid, rating: 7 });
    expect(r.ok).toBe(false);
    expect(reviewCreate).not.toHaveBeenCalled();
  });
  it('дубль (P2002) → «уже оставили»', async () => {
    const { Prisma } = await import('@prisma/client');
    reviewCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    const r = await submitReview(valid);
    expect(r).toEqual({ ok: false, error: 'Вы уже оставили отзыв' });
  });
  it('пустой body → null', async () => {
    await submitReview({ ...valid, body: '   ' });
    expect(reviewCreate.mock.calls[0][0].data.body).toBeNull();
  });
});
