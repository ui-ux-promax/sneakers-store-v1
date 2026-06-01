import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, findOrCreateCart, recalcCartTotalByToken } from '@/lib/cart';
import { cartCookieName, cartCookieOptions } from '@/lib/cart-cookie';
import { createCartItemSchema } from '@/services/dto/cart.dto';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const token = req.cookies.get(cartCookieName)?.value;
      if (!token) return NextResponse.json({ id: null, token: null, totalAmount: 0, items: [] });
      const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
      return NextResponse.json(cart ?? { id: null, token, totalAmount: 0, items: [] });
    } catch (error) {
      logger.error('cart_get_failed', error);
      return NextResponse.json({ message: 'Не удалось получить корзину' }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      let token = req.cookies.get(cartCookieName)?.value;
      if (!token) token = randomUUID();

      const parsed = createCartItemSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ message: 'Некорректные данные', issues: parsed.error.flatten() }, { status: 400 });
      }
      const { productVariantId, quantity = 1 } = parsed.data;

      const cart = await findOrCreateCart(token);

      const variant = await prisma.productVariant.findUnique({
        where: { id: productVariantId },
        include: { colorway: { include: { product: { select: { active: true } } } } },
      });
      if (!variant) return NextResponse.json({ message: 'Товар не найден' }, { status: 404 });
      if (!variant.active || !variant.colorway.product.active) {
        return NextResponse.json({ message: 'Товар недоступен' }, { status: 409 });
      }

      const existing = await prisma.cartItem.findUnique({
        where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
      });
      const nextQty = (existing?.quantity ?? 0) + quantity;
      if (variant.stock < nextQty) {
        return NextResponse.json({ message: 'Недостаточно на складе' }, { status: 409 });
      }

      if (existing) {
        await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
      } else {
        await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId, quantity } });
      }

      const updated = await recalcCartTotalByToken(token);
      const resp = NextResponse.json(updated);
      resp.cookies.set(cartCookieName, token, cartCookieOptions);
      return resp;
    } catch (error) {
      logger.error('cart_post_failed', error);
      return NextResponse.json({ message: 'Не удалось добавить в корзину' }, { status: 500 });
    }
  });
}
