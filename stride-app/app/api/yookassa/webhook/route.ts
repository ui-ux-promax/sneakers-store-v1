import { NextResponse } from 'next/server';
import { parseNotification } from '@webzaytsev/yookassa-ts-sdk';
import { logger } from '@/lib/logger';
import { applyPaymentSucceeded, applyPaymentCanceled } from '@/lib/payment-sync';
import { getPaymentStatus } from '@/lib/yookassa';

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
    const remoteStatus = await getPaymentStatus(notification.object.id);
    if (notification.event === 'payment.succeeded') {
      if (remoteStatus !== 'succeeded') return NextResponse.json({ ok: true });
      await applyPaymentSucceeded(notification.object.id);
    } else if (notification.event === 'payment.canceled') {
      if (remoteStatus !== 'canceled') return NextResponse.json({ ok: true });
      await applyPaymentCanceled(notification.object.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('yookassa_webhook_failed', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
