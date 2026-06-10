import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, calcLineTotal, type CartWithItems } from '@/lib/cart-details';

// Серверный модуль корзины (использует prisma). Чистые/клиент-safe части
// (cartInclude, getCartDetails, calcLineTotal, тип CartWithItems) вынесены в
// `lib/cart-details.ts` и реэкспортируются здесь — чтобы серверные импортёры
// (API-роуты, тесты) продолжали брать всё из `@/lib/cart`, а клиентский стор
// импортировал чистые функции из `@/lib/cart-details` без утечки prisma в браузер.
export { cartInclude, calcLineTotal, getCartDetails } from '@/lib/cart-details';
export type { CartWithItems } from '@/lib/cart-details';

// findOrCreateCart по cookie-токену.
export async function findOrCreateCart(token: string) {
  const existing = await prisma.cart.findFirst({ where: { token } });
  if (existing) return existing;
  return prisma.cart.create({ data: { token } });
}

// Резолвер владельца корзины (зеркало resolveOwnerWishlist).
// Залогинен → корзина по userId (привязана merge'ем при входе) — корзина живёт с аккаунтом,
// а не с cookie: другое устройство / новая сессия → та же корзина. Это закрывает утечку,
// когда cookie прежнего юзера видна следующему (резолв игнорирует cookie-токен у залогиненных).
// Гость → по cookie-токену.
// При create для залогиненного без своей корзины генерим СВЕЖИЙ token (не cookie): cookie-токен
// мог принадлежать чужой/гостевой корзине → не воруем и не ловим P2002 на @unique(token).
export async function resolveOwnerCart(
  userId: string | null | undefined,
  token: string | undefined,
  { create }: { create: boolean },
) {
  if (userId) {
    const existing = await prisma.cart.findFirst({ where: { userId } });
    if (existing) return existing;
    if (!create) return null;
    // Свежий token (НЕ cookie): cookie-токен мог принадлежать чужой/гостевой корзине.
    return prisma.cart.create({ data: { token: randomUUID(), userId } });
  }
  if (!token) return null;
  const existing = await prisma.cart.findFirst({ where: { token } });
  if (existing) return existing;
  if (!create) return null;
  return prisma.cart.create({ data: { token } });
}

// Пересчёт totalAmount БЕЗ $transaction. Читаем корзину с include один раз, считаем,
// сохраняем total и возвращаем уже загруженный объект с новым total — без избыточного
// повторного чтения (минус один Neon HTTP round-trip; меняется только totalAmount).
export async function recalcCartTotalByToken(token: string): Promise<CartWithItems | null> {
  const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
  if (!cart) return null;
  const totalAmount = cart.items.reduce((acc, i) => acc + calcLineTotal(i.productVariant.price, i.quantity), 0);
  await prisma.cart.update({ where: { id: cart.id }, data: { totalAmount } });
  return { ...cart, totalAmount };
}
