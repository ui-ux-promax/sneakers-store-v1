import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { normalizeSize } from '@/lib/format';
import type { CartDetails, CartStateItem } from '@/services/dto/cart.dto';

// Граф включения для всех чтений/мутаций корзины.
export const cartInclude = {
  items: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      productVariant: {
        include: {
          colorway: {
            include: {
              product: { select: { name: true, slug: true } },
              images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export function calcLineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

// Чистая функция: разворачивает серверный объект в плоские позиции для клиента.
export function getCartDetails(cart: CartWithItems): CartDetails {
  const items: CartStateItem[] = cart.items.map((item) => {
    const v = item.productVariant;
    const cw = v.colorway;
    const unitPrice = v.price;
    return {
      id: item.id,
      quantity: item.quantity,
      name: cw.product.name,
      productSlug: cw.product.slug,
      colorwayName: cw.name,
      sizeEu: normalizeSize(v.sizeEu as unknown as number),
      imageUrl: cw.images[0]?.url ?? null,
      unitPrice,
      lineTotal: calcLineTotal(unitPrice, item.quantity),
      stock: v.stock,
      available: v.active && v.stock > 0,
    };
  });
  const totalAmount = items.reduce((acc, i) => acc + i.lineTotal, 0);
  return { items, totalAmount };
}

// findOrCreateCart по cookie-токену.
export async function findOrCreateCart(token: string) {
  const existing = await prisma.cart.findFirst({ where: { token } });
  if (existing) return existing;
  return prisma.cart.create({ data: { token } });
}

// Пересчёт totalAmount БЕЗ $transaction: update без include, затем перезагрузка с include.
export async function recalcCartTotalByToken(token: string): Promise<CartWithItems | null> {
  const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
  if (!cart) return null;
  const totalAmount = cart.items.reduce((acc, i) => acc + calcLineTotal(i.productVariant.price, i.quantity), 0);
  await prisma.cart.update({ where: { id: cart.id }, data: { totalAmount } });
  return prisma.cart.findFirst({ where: { id: cart.id }, include: cartInclude });
}
