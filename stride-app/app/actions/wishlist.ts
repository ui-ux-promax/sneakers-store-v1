'use server';

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { resolveOwnerWishlist } from '@/lib/wishlist';
import { wishlistCookieName, wishlistCookieOptions } from '@/lib/wishlist-cookie';
import { wishlistToggleSchema } from '@/services/dto/wishlist.dto';

export type ToggleResult = { ok: true; active: boolean } | { ok: false; error: string };

export async function toggleWishlist(raw: unknown): Promise<ToggleResult> {
  const parsed = wishlistToggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Некорректный товар' };
  const { productId } = parsed.data;

  const session = await auth();
  const store = await cookies();
  let token = store.get(wishlistCookieName)?.value;

  // Гость без token: генерим и ставим cookie (Server Action умеет писать cookie).
  if (!token) {
    token = randomUUID();
    store.set(wishlistCookieName, token, wishlistCookieOptions);
  }

  const owner = await resolveOwnerWishlist(session, token, { create: true });
  if (!owner) return { ok: false, error: 'Не удалось открыть избранное' };

  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: owner.id, productId } },
    select: { id: true },
  });

  try {
    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      revalidatePath('/wishlist');
      return { ok: true, active: false };
    }
    await prisma.wishlistItem.create({ data: { wishlistId: owner.id, productId } });
  } catch (e) {
    // P2002: гонка дубля на @@unique → товар уже в избранном.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      revalidatePath('/wishlist');
      return { ok: true, active: true };
    }
    // P2003: несуществующий productId (FK) → ошибка клиенту.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return { ok: false, error: 'Товар не найден' };
    }
    throw e;
  }

  revalidatePath('/wishlist');
  return { ok: true, active: true };
}
