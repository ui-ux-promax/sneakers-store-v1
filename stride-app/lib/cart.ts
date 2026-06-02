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
