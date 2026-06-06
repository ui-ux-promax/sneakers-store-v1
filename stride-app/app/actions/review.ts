'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { canReview } from '@/lib/review';
import { reviewSchema } from '@/services/dto/review.dto';

export type SubmitReviewResult = { ok: true } | { ok: false; error: string };

export async function submitReview(raw: unknown): Promise<SubmitReviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Войдите, чтобы оставить отзыв' };
  const userId = session.user.id;

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };
  const { productId, slug, rating, body } = parsed.data;

  // Источник истины — клиентскому праву на отзыв не доверяем.
  if (!(await canReview(userId, productId))) {
    return { ok: false, error: 'Отзыв доступен после покупки' };
  }

  try {
    await prisma.review.create({
      data: { productId, userId, rating, body: body?.trim() ? body.trim() : null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'Вы уже оставили отзыв' };
    }
    throw e;
  }

  revalidatePath(`/product/${slug}`);
  return { ok: true };
}
