'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { cartInclude } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { recalcCartTotalByToken } from '@/lib/cart';
import { checkoutSchema } from '@/services/dto/order.dto';
import { buildOrderSnapshot, calcShipping } from '@/lib/order';
import { logger } from '@/lib/logger';

export type PlaceOrderResult = { ok: true; orderNumber: number } | { ok: false; error: string };

async function restoreStock(items: { id: string; qty: number }[]): Promise<void> {
  for (const it of items) {
    try {
      await prisma.productVariant.update({ where: { id: it.id }, data: { stock: { increment: it.qty } } });
    } catch (e) {
      logger.error('place_order_stock_restore_failed', e, { variantId: it.id });
    }
  }
}

export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };
  const userId = session.user.id;

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Проверьте поля формы' };
  const form = parsed.data;

  const store = await cookies();
  const token = store.get(cartCookieName)?.value;
  if (!token) return { ok: false, error: 'Корзина пуста' };

  const cart = await prisma.cart.findFirst({ where: { token }, include: cartInclude });
  if (!cart || cart.items.length === 0) return { ok: false, error: 'Корзина пуста' };

  const inactive = cart.items.find(
    (i) => !i.productVariant.active || !i.productVariant.colorway.product.active,
  );
  if (inactive) {
    return {
      ok: false,
      error: `Товар «${inactive.productVariant.colorway.product.name}» больше недоступен, удалите его из корзины`,
    };
  }

  const snapshot = buildOrderSnapshot(cart);
  const shippingAmount = calcShipping(snapshot.itemsTotal, form.shippingMethod);
  const totalAmount = snapshot.itemsTotal + shippingAmount;

  const decremented: { id: string; qty: number }[] = [];
  for (const it of snapshot.items) {
    const res = await prisma.productVariant.updateMany({
      where: { id: it.productVariantId, stock: { gte: it.quantity } },
      data: { stock: { decrement: it.quantity } },
    });
    if (res.count === 1) {
      decremented.push({ id: it.productVariantId, qty: it.quantity });
    } else {
      await restoreStock(decremented);
      return { ok: false, error: `Товар «${it.productName}» закончился, обновите корзину` };
    }
  }

  let orderNumber: number;
  try {
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        shippingMethod: form.shippingMethod,
        city: form.city,
        addressLine: form.addressLine,
        addressComment: form.addressComment || null,
        itemsTotal: snapshot.itemsTotal,
        shippingAmount,
        totalAmount,
        paymentMethod: 'cod',
        items: { create: snapshot.items },
      },
      select: { orderNumber: true },
    });
    orderNumber = order.orderNumber;
  } catch (e) {
    await restoreStock(decremented);
    logger.error('place_order_create_failed', e);
    return { ok: false, error: 'Не удалось оформить заказ. Попробуйте позже' };
  }

  try {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await recalcCartTotalByToken(token);
  } catch (e) {
    logger.error('order_cart_cleanup_failed', e, { orderNumber });
  }

  return { ok: true, orderNumber };
}

export type CancelOrderResult = { ok: true } | { ok: false; error: string };

export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };
  const userId = session.user.id;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== userId || order.status !== 'PENDING') {
    return { ok: false, error: 'Этот заказ нельзя отменить' };
  }

  const locked = await prisma.order.updateMany({
    where: { id: orderId, userId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (locked.count === 0) return { ok: false, error: 'Заказ уже обработан' };

  for (const item of order.items) {
    try {
      await prisma.productVariant.update({
        where: { id: item.productVariantId },
        data: { stock: { increment: item.quantity } },
      });
    } catch (e) {
      logger.error('cancel_stock_restore_failed', e, { orderId, variantId: item.productVariantId });
    }
  }

  revalidatePath('/profile');
  revalidatePath(`/orders/${order.orderNumber}`);
  return { ok: true };
}
