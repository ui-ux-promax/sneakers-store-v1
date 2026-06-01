import type { Prisma } from '@prisma/client';
import { normalizeSize } from '@/lib/format';
import type { CartDetails, CartStateItem } from '@/services/dto/cart.dto';

// CLIENT-SAFE модуль: НЕ импортирует prisma-client (`@prisma/client` рантайм),
// поэтому его можно безопасно импортировать в клиентских компонентах / Zustand-сторе.
// Серверные функции (findOrCreateCart / recalc, требующие prisma) живут в `lib/cart.ts`.

// Граф включения для всех чтений/мутаций корзины (тип-онли использование Prisma — стирается в бандле).
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

// Чистая функция: разворачивает серверный объект корзины в плоские позиции для клиента.
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
