'use server';

import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma-client';
import { cartInclude } from '@/lib/cart-details';
import { cartCookieName } from '@/lib/cart-cookie';
import { recalcCartTotalByToken, resolveOwnerCart } from '@/lib/cart';
import { checkoutSchema } from '@/services/dto/order.dto';
import { buildOrderSnapshot, calcShipping } from '@/lib/order';
import { checkCoupon, calcCouponDiscount } from '@/lib/coupon';
import { logger } from '@/lib/logger';
import { createPayment, cancelPayment } from '@/lib/yookassa';
import { pruneReviewsAfterCancel } from '@/lib/review';
import { adjustSalesCount } from '@/lib/sales-count';

export type PlaceOrderResult = { ok: true; orderNumber: number; paymentUrl?: string } | { ok: false; error: string };

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
  // Корзина залогиненного резолвится по userId (не по cookie) — заказ всегда из своей корзины.
  const owner = await resolveOwnerCart(userId, token, { create: false });
  if (!owner) return { ok: false, error: 'Корзина пуста' };
  const cart = await prisma.cart.findFirst({ where: { id: owner.id }, include: cartInclude });
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

  // Купон — повторная валидация на сервере (источник истины; клиентскому couponCode не доверяем).
  // До декремента стока → при отказе откатывать нечего.
  let discountAmount = 0;
  let couponCode: string | null = null;
  if (form.couponCode && form.couponCode.trim()) {
    const check = await checkCoupon(form.couponCode);
    if (!check.ok) return { ok: false, error: check.error };
    discountAmount = calcCouponDiscount(snapshot.itemsTotal, check.percent);
    couponCode = check.code;
  }

  const shippingAmount = calcShipping(snapshot.itemsTotal, form.shippingMethod);
  const totalAmount = snapshot.itemsTotal - discountAmount + shippingAmount;

  const decremented: { id: string; qty: number }[] = [];
  for (const it of snapshot.items) {
    // Проверка стока + атомарный декремент. `updateMany`/$executeRaw не работают
    // на прод-Neon (транзакционны — P9), поэтому findUnique + одиночный update
    // c `decrement` (доказанно рабочий, probe). Риск гонки между read и decrement
    // приемлем для MVP (как и в Фазе 1).
    const v = await prisma.productVariant.findUnique({
      where: { id: it.productVariantId },
      select: { stock: true },
    });
    if (!v || v.stock < it.quantity) {
      await restoreStock(decremented);
      return { ok: false, error: `Товар «${it.productName}» закончился, обновите корзину` };
    }
    await prisma.productVariant.update({
      where: { id: it.productVariantId },
      data: { stock: { decrement: it.quantity } },
    });
    decremented.push({ id: it.productVariantId, qty: it.quantity });
  }

  let orderId: string;
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
        city: form.city ?? '',
        addressLine: form.addressLine,
        addressComment: form.addressComment || null,
        itemsTotal: snapshot.itemsTotal,
        discountAmount,
        shippingAmount,
        totalAmount,
        couponCode,
        paymentMethod: form.paymentMethod,
      },
      select: { id: true, orderNumber: true },
    });
    orderId = order.id;
    orderNumber = order.orderNumber;
  } catch (e) {
    await restoreStock(decremented);
    logger.error('place_order_create_failed', e);
    return { ok: false, error: 'Не удалось оформить заказ. Попробуйте позже' };
  }

  // Позиции — ПО ОДНОЙ (одиночные INSERT). И вложенный `items: { create }`, и
  // `createMany` Prisma исполняет в НЕЯВНОЙ транзакции, которую Neon HTTP не поддерживает
  // (проверено против адаптера; TROUBLESHOOTING P5/P7). Сбой → откат: удалить заказ
  // (каскад onDelete уберёт уже созданные позиции — одиночный DELETE, без транзакции) + вернуть сток.
  try {
    for (const it of snapshot.items) {
      await prisma.orderItem.create({ data: { ...it, orderId } });
    }
  } catch (e) {
    try {
      await prisma.order.delete({ where: { id: orderId } });
    } catch (delErr) {
      logger.error('place_order_order_rollback_failed', delErr, { orderId });
    }
    await restoreStock(decremented);
    logger.error('place_order_items_failed', e, { orderId });
    return { ok: false, error: 'Не удалось оформить заказ. Попробуйте позже' };
  }

  let paymentUrl: string | undefined;
  if (form.paymentMethod === 'online') {
    try {
      // return_url ДОЛЖЕН вести на тот же деплой, где оформлен заказ: там сессия, кука и
      // нужная ветка Neon (БД заводит ветку на каждое окружение, P7). Поэтому приоритет —
      // host текущего запроса; NEXT_PUBLIC_SITE_URL — только фолбэк для localhost.
      const host = (await headers()).get('host') || '';
      const baseUrl = host ? `https://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
      const pay = await createPayment({ orderNumber, amountRub: totalAmount, baseUrl });
      await prisma.payment.create({
        data: { id: pay.id, orderId, amount: totalAmount, confirmationUrl: pay.confirmationUrl, status: 'pending' },
      });
      paymentUrl = pay.confirmationUrl;
    } catch (e) {
      try {
        await prisma.order.delete({ where: { id: orderId } });
      } catch (delErr) {
        logger.error('place_order_payment_rollback_failed', delErr, { orderId });
      }
      await restoreStock(decremented);
      logger.error('place_order_payment_failed', e, { orderId });
      return { ok: false, error: 'Не удалось создать платёж. Попробуйте позже' };
    }
  }

  // Популярность: +продажи по товарам заказа (как списанный сток). После всех точек отката —
  // если дошли сюда, заказ создан и сток списан, инкремент симметричен. Best-effort внутри.
  await adjustSalesCount(
    cart.items.map((i) => ({ productId: i.productVariant.colorway.product.id, quantity: i.quantity })),
    1,
  );

  try {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await recalcCartTotalByToken(cart.token);
  } catch (e) {
    logger.error('order_cart_cleanup_failed', e, { orderNumber });
  }

  return { ok: true, orderNumber, paymentUrl };
}

export type CancelOrderResult = { ok: true } | { ok: false; error: string };

export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Не авторизован' };
  const userId = session.user.id;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { productVariant: { select: { colorway: { select: { productId: true } } } } } },
      payment: true,
    },
  });
  if (!order || order.userId !== userId || order.status !== 'PENDING') {
    return { ok: false, error: 'Этот заказ нельзя отменить' };
  }

  // Атомарный переход PENDING→CANCELLED (одиночный UPDATE ... WHERE id AND userId AND status):
  // гарантирует, что побочные эффекты (возврат стока, откат salesCount, отмена платежа)
  // применятся РОВНО ОДИН РАЗ даже в гонке с вебхуком ЮKassa, который мог отменить платёж
  // между findUnique и этим update. P2025 = заказ уже не PENDING → ничего не откатываем.
  try {
    await prisma.order.update({
      where: { id: orderId, userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, error: 'Этот заказ нельзя отменить' };
    }
    throw e;
  }

  if (order.payment && order.payment.status === 'pending') {
    try {
      await cancelPayment(order.payment.id);
    } catch (e) {
      logger.error('cancel_payment_failed', e, { orderId, paymentId: order.payment.id });
    }
  }

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

  // Популярность: −продажи по товарам отменённого заказа (симметрично возврату стока).
  await adjustSalesCount(
    order.items.map((i) => ({ productId: i.productVariant.colorway.productId, quantity: i.quantity })),
    -1,
  );

  // Отмена аннулирует «покупку»: снять осиротевшие отзывы по товарам этого заказа
  // (если по товару не осталось другого квалифицирующего заказа). PDP — force-dynamic,
  // перечитает список при следующем рендере, так что отдельная ревалидация не нужна.
  const productIds = [...new Set(order.items.map((i) => i.productVariant.colorway.productId))];
  await pruneReviewsAfterCancel(userId, productIds);

  revalidatePath('/profile');
  revalidatePath(`/orders/${order.orderNumber}`);
  return { ok: true };
}
