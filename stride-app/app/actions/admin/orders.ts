'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAction } from '@/lib/admin/require-admin';
import { prisma } from '@/lib/prisma-client';
import { orderStatusUpdateSchema } from '@/services/dto/order-admin.dto';
import { nextOrderStatus } from '@/lib/order-admin';
import { adjustSalesCount } from '@/lib/sales-count';
import { cancelPayment } from '@/lib/yookassa';
import { pruneReviewsAfterCancel } from '@/lib/review';
import { logger } from '@/lib/logger';

export type OrderActionResult = { ok: true } | { ok: false; error: string };

const LIST_PATH = '/admin/orders';

// Forward-переход по пайплайну. Чистая прогрессия — сток/платёж/salesCount НЕ трогаем.
export async function advanceOrderStatus(input: unknown): Promise<OrderActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = orderStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Некорректный статус' };
  const { orderId, toStatus } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return { ok: false, error: 'Заказ не найден' };
  if (nextOrderStatus(order.status) !== toStatus) {
    return { ok: false, error: 'Недопустимый переход статуса' };
  }

  // Guarded one-shot: матчим текущий статус, чтобы не перепрыгнуть параллельное изменение.
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: { status: toStatus },
  });
  if (res.count === 0) return { ok: false, error: 'Статус заказа изменился, обновите страницу' };

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${orderId}`);
  return { ok: true };
}

// Отмена до отгрузки: PENDING/PROCESSING → CANCELLED. Возврат стока (списан при оформлении)
// + salesCount −1 (+ отмена pending-платежа). Guarded updateMany гарантирует ровно один реальный
// переход даже в гонке с вебхуком ЮKassa (тот правит только PENDING) — побочки применяются один раз.
export async function cancelOrderByAdmin(orderId: string): Promise<OrderActionResult> {
  const gate = await requireAdminAction();
  if (!gate.ok) return { ok: false, error: gate.error };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { productVariant: { select: { colorway: { select: { productId: true } } } } } },
      payment: true,
    },
  });
  if (!order) return { ok: false, error: 'Заказ не найден' };

  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'CANCELLED' },
  });
  if (res.count === 0) return { ok: false, error: 'Этот заказ нельзя отменить' };

  // Pending-платёж: отменить в ЮKassa + отразить в записи. Succeeded НЕ рефандим (вне MVP —
  // возврат денег вручную в кабинете ЮKassa).
  if (order.payment && order.payment.status === 'pending') {
    try {
      await cancelPayment(order.payment.id);
    } catch (e) {
      logger.error('admin_cancel_payment_failed', e, { orderId, paymentId: order.payment.id });
    }
    try {
      await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'canceled' } });
    } catch (e) {
      logger.error('admin_cancel_payment_status_failed', e, { orderId });
    }
  }

  // Возврат стока — релятивен, применяется один раз (guard выше). Best-effort по позициям.
  for (const item of order.items) {
    try {
      await prisma.productVariant.update({
        where: { id: item.productVariantId },
        data: { stock: { increment: item.quantity } },
      });
    } catch (e) {
      logger.error('admin_cancel_stock_restore_failed', e, { orderId, variantId: item.productVariantId });
    }
  }

  // Популярность: −продажи по товарам отменённого заказа (симметрично возврату стока).
  await adjustSalesCount(
    order.items.map((i) => ({ productId: i.productVariant.colorway.productId, quantity: i.quantity })),
    -1,
  );

  // Отмена аннулирует «покупку» → снять осиротевшие отзывы (как клиентский cancelOrder).
  const productIds = [...new Set(order.items.map((i) => i.productVariant.colorway.productId))];
  await pruneReviewsAfterCancel(order.userId, productIds);

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${orderId}`);
  revalidatePath('/profile');
  revalidatePath(`/orders/${order.orderNumber}`);
  return { ok: true };
}
