import { NextResponse } from 'next/server';
import { parseNotification } from '@webzaytsev/yookassa-ts-sdk';
import { logger } from '@/lib/logger';
import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';

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
      await applyPaymentSucceeded(notification.object.id);
    } else if (notification.event === 'payment.canceled') {
      await applyPaymentCanceled(notification.object.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('yookassa_webhook_failed', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
