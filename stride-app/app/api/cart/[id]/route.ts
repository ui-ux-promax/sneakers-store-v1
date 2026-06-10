import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { resolveOwnerCart, recalcCartTotalByToken } from '@/lib/cart';
import { cartCookieName } from '@/lib/cart-cookie';
import { updateQuantitySchema } from '@/services/dto/cart.dto';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return runWithRequestContext(req, async () => {
    try {
      const { id } = await params;
      const session = await auth();
      const token = req.cookies.get(cartCookieName)?.value;
      const owner = await resolveOwnerCart(session?.user?.id ?? null, token, { create: false });
      if (!owner) return NextResponse.json({ message: 'Корзина не найдена' }, { status: 401 });

      const parsed = updateQuantitySchema.safeParse(await req.json());
      if (!parsed.success) return NextResponse.json({ message: 'Некорректное количество' }, { status: 400 });

      // Позиция должна принадлежать корзине ВЛАДЕЛЬЦА (по cartId, не по cookie-токену).
      const item = await prisma.cartItem.findFirst({
        where: { id, cartId: owner.id },
        include: { productVariant: { select: { stock: true } } },
      });
      if (!item) return NextResponse.json({ message: 'Позиция не найдена' }, { status: 404 });
      if (item.productVariant.stock < parsed.data.quantity) {
        return NextResponse.json({ message: 'Недостаточно на складе' }, { status: 409 });
      }

      await prisma.cartItem.update({ where: { id }, data: { quantity: parsed.data.quantity } });
      const updated = await recalcCartTotalByToken(owner.token);
      return NextResponse.json(updated);
    } catch (error) {
      logger.error('cart_patch_failed', error);
      return NextResponse.json({ message: 'Не удалось обновить корзину' }, { status: 500 });
    }
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return runWithRequestContext(req, async () => {
    try {
      const { id } = await params;
      const session = await auth();
      const token = req.cookies.get(cartCookieName)?.value;
      const owner = await resolveOwnerCart(session?.user?.id ?? null, token, { create: false });
      if (!owner) return NextResponse.json({ message: 'Корзина не найдена' }, { status: 401 });

      const item = await prisma.cartItem.findFirst({ where: { id, cartId: owner.id } });
      if (!item) return NextResponse.json({ message: 'Позиция не найдена' }, { status: 404 });

      await prisma.cartItem.delete({ where: { id } });
      const updated = await recalcCartTotalByToken(owner.token);
      return NextResponse.json(updated);
    } catch (error) {
      logger.error('cart_delete_failed', error);
      return NextResponse.json({ message: 'Не удалось удалить позицию' }, { status: 500 });
    }
  });
}
