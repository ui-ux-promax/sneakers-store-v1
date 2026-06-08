import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';
import { adjustSalesCount } from '@/lib/sales-count';

// Применяет эффекты успешной оплаты: Payment→succeeded, Order→PROCESSING.
// Идемпотентно: повторный вызов (вебхук + страница заказа) не ломает состояние.
export async function applyPaymentSucceeded(paymentId: string): Promise<void> {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'succeeded', paidAt: new Date() } });
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (payment) {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PROCESSING' } });
  }
}

// Применяет эффекты отмены: Payment→canceled, Order→CANCELLED, возврат стока (по одной позиции)
// + откат популярности (salesCount −продажи, симметрично возврату стока).
export async function applyPaymentCanceled(paymentId: string): Promise<void> {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'canceled' } });
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { items: { include: { productVariant: { select: { colorway: { select: { productId: true } } } } } } } } },
  });
  if (!payment) return;
  // Возврат стока и откат salesCount — РЕЛЯТИВНЫ, поэтому выполняем строго один раз через
  // условный переход PENDING→CANCELLED (одиночный UPDATE ... WHERE id AND status). Вторичные
  // вызовы — ретрай вебхука ЮKassa (at-least-once), поллинг страницы заказа (force-dynamic) и
  // уже отменивший заказ cancelOrder — не найдут PENDING-заказ (P2025) и выйдут без повторного
  // инкремента; иначе сток пере-восстанавливается, а salesCount уходит в минус и ломает
  // сортировку по популярности.
  try {
    await prisma.order.update({ where: { id: payment.orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return;
    throw e;
  }
  for (const item of payment.order.items) {
    try {
      await prisma.productVariant.update({ where: { id: item.productVariantId }, data: { stock: { increment: item.quantity } } });
    } catch (e) {
      logger.error('payment_canceled_stock_restore_failed', e, { variantId: item.productVariantId });
    }
  }
  await adjustSalesCount(
    payment.order.items.map((i) => ({ productId: i.productVariant.colorway.productId, quantity: i.quantity })),
    -1,
  );
}
