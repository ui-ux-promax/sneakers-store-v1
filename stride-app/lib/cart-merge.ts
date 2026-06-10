import { prisma } from '@/lib/prisma-client';
import { recalcCartTotalByToken } from '@/lib/cart';
import { logger } from '@/lib/logger';

// Слияние гостевой корзины в корзину пользователя при входе/регистрации.
//
// ВАЖНО: Neon HTTP-адаптер НЕ поддерживает $transaction (см. lib/prisma-client.ts),
// поэтому настоящей атомарности нет. Дизайн сделан ИДЕМПОТЕНТНЫМ/СХОДЯЩИМСЯ:
//  - каждая позиция переносится атомарным upsert { increment } — защита от lost-update
//    при параллельном add-to-cart и от P2002-гонки на @@unique([cartId, productVariantId]);
//  - исходная позиция удаляется СРАЗУ после переноса → повтор после частичного сбоя
//    (а Neon-сбои у нас реальны, см. P4) не задваивает уже перенесённое;
//  - сливаются ВСЕ прежние корзины пользователя (Cart.userId НЕ уникален), не только одна;
//  - итоговые количества клампятся к остатку — merge это единственный путь добавления в
//    обход 409-проверки склада в POST /api/cart.
// Остаточное окно: сбой строго между upsert и delete одной позиции может задвоить ОДНУ
// позицию при следующем входе. Это приемлемый максимум без транзакций (docs/TROUBLESHOOTING.md P5).
export async function mergeGuestCart(guestToken: string | undefined, userId: string): Promise<void> {
  if (!guestToken) return;

  const guestCart = await prisma.cart.findFirst({ where: { token: guestToken } });
  if (!guestCart) return;

  // Анти-кража (#leak): если cookie-токен уже принадлежит ДРУГОМУ пользователю
  // (юзер B вошёл со стащенной/несброшенной cookie юзера A) — НЕ перепривязываем
  // корзину A к B. Сливаем только свободный (гостевой) или уже-свой токен.
  if (guestCart.userId && guestCart.userId !== userId) return;

  // Привязываем гостевую корзину к пользователю (идемпотентно: повтор для того же userId безвреден).
  if (guestCart.userId !== userId) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId } });
  }

  // Сливаем ВСЕ прежние корзины пользователя в гостевую, позиция за позицией.
  const priorCarts = await prisma.cart.findMany({
    where: { userId, NOT: { id: guestCart.id } },
    include: { items: true },
  });
  for (const prior of priorCarts) {
    for (const item of prior.items) {
      await prisma.cartItem.upsert({
        where: { cartId_productVariantId: { cartId: guestCart.id, productVariantId: item.productVariantId } },
        create: { cartId: guestCart.id, productVariantId: item.productVariantId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      });
      await prisma.cartItem.delete({ where: { id: item.id } });
    }
    await prisma.cart.delete({ where: { id: prior.id } });
  }

  // Stock-clamp: ни одна позиция не должна превышать остаток на складе.
  const merged = await prisma.cartItem.findMany({
    where: { cartId: guestCart.id },
    include: { productVariant: { select: { stock: true } } },
  });
  for (const item of merged) {
    if (item.quantity > item.productVariant.stock) {
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: item.productVariant.stock } });
    }
  }

  await recalcCartTotalByToken(guestCart.token);
}

// Обёртка для вызова из events.signIn: слияние корзины НИКОГДА не должно ронять
// аутентификацию (#4/#9). Любой сбой (включая транзиентные Neon-ошибки) глотается
// и логируется — пользователь входит, корзина досольётся при следующем входе (merge идемпотентен).
export async function safeMergeGuestCart(guestToken: string | undefined, userId: string): Promise<boolean> {
  try {
    await mergeGuestCart(guestToken, userId);
    return true;
  } catch (err) {
    logger.error('cart_merge_on_signin_failed', err);
    return false;
  }
}
