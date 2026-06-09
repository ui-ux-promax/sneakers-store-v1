import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

// Слияние гостевого избранного в избранное пользователя при входе.
// Neon без жёстких транзакций → идемпотентный/сходящийся дизайн:
//  - перенос позиций upsert по @@unique([wishlistId, productId]) (дедуп, защита от P2002);
//  - удаление гостевого wishlist ПОСЛЕ переноса → повтор после сбоя не двоит;
//  - повтор входа безопасен.
export async function mergeGuestWishlist(guestToken: string | undefined, userId: string): Promise<void> {
  if (!guestToken) return;

  const guest = await prisma.wishlist.findFirst({ where: { token: guestToken } });
  if (!guest) return;

  // Гостевой уже принадлежит этому пользователю — нечего сливать.
  if (guest.userId === userId) return;

  // Анти-кража (#leak): токен принадлежит ДРУГОМУ пользователю (вход со стащенной/
  // несброшенной cookie) — не перепривязываем чужое избранное к текущему юзеру.
  if (guest.userId) return;

  const userWishlist = await prisma.wishlist.findFirst({ where: { userId } });

  // У пользователя нет своего wishlist → просто привязываем гостевой.
  if (!userWishlist) {
    await prisma.wishlist.update({ where: { id: guest.id }, data: { userId } });
    return;
  }

  // Иначе переносим позиции и удаляем опустевший гостевой.
  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId: guest.id },
    select: { productId: true },
  });
  for (const it of items) {
    await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: userWishlist.id, productId: it.productId } },
      create: { wishlistId: userWishlist.id, productId: it.productId },
      update: {},
    });
  }
  await prisma.wishlist.delete({ where: { id: guest.id } });
}

// Обёртка для events.signIn: merge НИКОГДА не должен ронять аутентификацию.
export async function safeMergeGuestWishlist(guestToken: string | undefined, userId: string): Promise<boolean> {
  try {
    await mergeGuestWishlist(guestToken, userId);
    return true;
  } catch (err) {
    logger.error('wishlist_merge_on_signin_failed', err);
    return false;
  }
}
