'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { canReview, isValidRating } from '@/lib/review';
import { reviewSchema } from '@/services/dto/review.dto';

export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(raw: unknown): Promise<SubmitReviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Войдите, чтобы оставить отзыв' };
  const userId = session.user.id;

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };
  const { productId, rating, body } = parsed.data;
  if (!isValidRating(rating)) return { ok: false, error: 'Оценка должна быть от 1 до 5' };

  // Источник истины — клиентскому праву на отзыв не доверяем.
  if (!(await canReview(userId, productId))) {
    return { ok: false, error: 'Отзыв доступен после покупки' };
  }

  try {
    await prisma.review.create({
      data: { productId, userId, rating, body: body?.trim() ? body.trim() : null },
    });
  } catch (e) {
    // P2002 (unique productId+userId) — авторитетный дедуп при гонке canReview↔create.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Вы уже оставили отзыв' };
    }
    throw e;
  }

  // slug re-derive на сервере (не доверяем клиентскому slug → нет cache-bust произвольных страниц).
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (product) revalidatePath(`/product/${product.slug}`);
  return { ok: true };
}
