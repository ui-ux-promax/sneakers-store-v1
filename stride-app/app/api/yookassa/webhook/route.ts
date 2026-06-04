import { NextResponse } from 'next/server';
import { parseNotification } from '@webzaytsev/yookassa-ts-sdk';
import { prisma } from '@/lib/prisma-client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let notification;
  try {
    const body = await req.json();
    notification = parseNotification(body);
  } catch (e) {
    logger.error('yookassa_webhook_parse_failed', e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    if (notification.event === 'payment.succeeded') {
      const id = notification.object.id;
      await prisma.payment.update({ where: { id }, data: { status: 'succeeded', paidAt: new Date() } });
      const payment = await prisma.payment.findUnique({ where: { id } });
      if (payment) {
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'PROCESSING' } });
      }
    } else if (notification.event === 'payment.canceled') {
      const id = notification.object.id;
      await prisma.payment.update({ where: { id }, data: { status: 'canceled' } });
      const payment = await prisma.payment.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
      if (payment) {
        await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELLED' } });
        for (const item of payment.order.items) {
          try {
            await prisma.productVariant.update({ where: { id: item.productVariantId }, data: { stock: { increment: item.quantity } } });
          } catch (e) {
            logger.error('yookassa_webhook_stock_restore_failed', e, { variantId: item.productVariantId });
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('yookassa_webhook_failed', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
