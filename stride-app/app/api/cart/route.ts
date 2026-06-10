import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma-client';
import { cartInclude, resolveOwnerCart, recalcCartTotalByToken } from '@/lib/cart';
import { cartCookieName, cartCookieOptions } from '@/lib/cart-cookie';
import { createCartItemSchema } from '@/services/dto/cart.dto';
import { runWithRequestContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';
import { extractClientIp, checkCartRateLimit } from '@/lib/rate-limit';
import { tooManyRequests } from '@/lib/rate-limit-response';

export async function GET(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const session = await auth();
      const userId = session?.user?.id ?? null;
      const token = req.cookies.get(cartCookieName)?.value;
      // Залогинен → корзина по userId (не по cookie); гость → по token.
      const owner = await resolveOwnerCart(userId, token, { create: false });
      if (!owner) return NextResponse.json({ id: null, token: token ?? null, totalAmount: 0, items: [] });
      const cart = await prisma.cart.findFirst({ where: { id: owner.id }, include: cartInclude });
      const resp = NextResponse.json(cart ?? { id: owner.id, token: owner.token, totalAmount: 0, items: [] });
      // Синхронизируем cookie с корзиной владельца (напр. вход на новом устройстве).
      if (owner.token !== token) resp.cookies.set(cartCookieName, owner.token, cartCookieOptions);
      return resp;
    } catch (error) {
      logger.error('cart_get_failed', error);
      return NextResponse.json({ message: 'Не удалось получить корзину' }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return runWithRequestContext(req, async () => {
    try {
      const ip = extractClientIp(req);
      const rl = await checkCartRateLimit(ip);
      if (!rl.success) return tooManyRequests(rl, 'Слишком часто. Попробуйте позже');
      const session = await auth();
      const userId = session?.user?.id ?? null;
      const cookieToken = req.cookies.get(cartCookieName)?.value ?? randomUUID();

      const parsed = createCartItemSchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json({ message: 'Некорректные данные', issues: parsed.error.flatten() }, { status: 400 });
      }
      const { productVariantId, quantity = 1 } = parsed.data;

      // Корзина владельца (залогинен → по userId; гость → по token) и вариант — параллельно.
      const [cart, variant] = await Promise.all([
        resolveOwnerCart(userId, cookieToken, { create: true }),
        prisma.productVariant.findUnique({
          where: { id: productVariantId },
          include: { colorway: { include: { product: { select: { active: true } } } } },
        }),
      ]);
      if (!cart) return NextResponse.json({ message: 'Не удалось открыть корзину' }, { status: 500 });
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

      const updated = await recalcCartTotalByToken(cart.token);
      const resp = NextResponse.json(updated);
      // Cookie → token корзины владельца (у залогиненного может отличаться от cookieToken).
      resp.cookies.set(cartCookieName, cart.token, cartCookieOptions);
      return resp;
    } catch (error) {
      logger.error('cart_post_failed', error);
      return NextResponse.json({ message: 'Не удалось добавить в корзину' }, { status: 500 });
    }
  });
}
