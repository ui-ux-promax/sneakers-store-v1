import { prisma } from '@/lib/prisma-client';
import { recalcCartTotalByToken } from '@/lib/cart';

export interface MergeSourceItem { productVariantId: string; quantity: number; }
export interface MergeTargetItem { id: string; productVariantId: string; quantity: number; }
export interface CartMergePlan {
  increments: { id: string; quantity: number }[];
  creates: { productVariantId: string; quantity: number }[];
}

export function planCartMerge(source: MergeSourceItem[], target: MergeTargetItem[]): CartMergePlan {
  const byVariant = new Map(target.map((t) => [t.productVariantId, t]));
  const increments: CartMergePlan['increments'] = [];
  const creates: CartMergePlan['creates'] = [];
  for (const s of source) {
    const t = byVariant.get(s.productVariantId);
    if (t) increments.push({ id: t.id, quantity: t.quantity + s.quantity });
    else creates.push({ productVariantId: s.productVariantId, quantity: s.quantity });
  }
  return { increments, creates };
}

export async function mergeGuestCart(guestToken: string | undefined, userId: string): Promise<void> {
  if (!guestToken) return;

  const guestCart = await prisma.cart.findFirst({ where: { token: guestToken }, include: { items: true } });
  if (!guestCart) return;

  const priorUserCart = await prisma.cart.findFirst({
    where: { userId, NOT: { id: guestCart.id } },
    include: { items: true },
  });

  if (guestCart.userId !== userId) {
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userId } });
  }

  if (priorUserCart) {
    if (priorUserCart.items.length) {
      const plan = planCartMerge(
        priorUserCart.items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })),
        guestCart.items.map((i) => ({ id: i.id, productVariantId: i.productVariantId, quantity: i.quantity })),
      );
      for (const inc of plan.increments) {
        await prisma.cartItem.update({ where: { id: inc.id }, data: { quantity: inc.quantity } });
      }
      for (const cr of plan.creates) {
        await prisma.cartItem.create({ data: { cartId: guestCart.id, productVariantId: cr.productVariantId, quantity: cr.quantity } });
      }
    }
    await prisma.cart.delete({ where: { id: priorUserCart.id } });
  }

  await recalcCartTotalByToken(guestCart.token);
}
