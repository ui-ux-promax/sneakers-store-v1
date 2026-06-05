import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

// Применяет эффекты успешной оплаты: Payment→succeeded, Order→PROCESSING.
// Идемпотентно: повторный вызов (вебхук + страница заказа) не ломает состояние.
export async function applyPaymentSucceeded(paymentId: string): Promise<void> {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'succeeded', paidAt: new Date() } });
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (payment) {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PROCESSING' } });
  }
}

// Применяет эффекты отмены: Payment→canceled, Order→CANCELLED, возврат стока (по одной позиции).
export async function applyPaymentCanceled(paymentId: string): Promise<void> {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'canceled' } });
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
  if (payment) {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
    for (const item of payment.order.items) {
      try {
        await prisma.productVariant.update({ where: { id: item.productVariantId }, data: { stock: { increment: item.quantity } } });
      } catch (e) {
        logger.error('payment_canceled_stock_restore_failed', e, { variantId: item.productVariantId });
      }
    }
  }
}
