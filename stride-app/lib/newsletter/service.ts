import { createElement } from 'react';
import { prisma } from '@/lib/prisma-client';
import { getResend } from '@/lib/email/resend-client';
import { sendEmail } from '@/lib/email/send-email';
import { NewsletterWelcomeEmail } from '@/emails/newsletter-welcome';
import { buildUnsubscribeUrl } from '@/lib/newsletter/unsubscribe-token';
import type { NewsletterSource } from '@/constants/config';
import { logger } from '@/lib/logger';

export type SubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

// Best-effort синк в Resend Audience. Сбой логируется, подписку не роняет.
async function syncToAudience(email: string): Promise<string | null> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const resend = getResend();
  if (!audienceId || !resend) return null;
  try {
    const { data, error } = await resend.contacts.create({ email, audienceId, unsubscribed: false });
    if (error || !data) { logger.warn('audience_sync_failed', { error: error?.message }); return null; }
    return data.id;
  } catch (e) {
    logger.warn('audience_sync_threw', { err: String(e) });
    return null;
  }
}

export async function subscribe(emailRaw: string, source: NewsletterSource = 'footer'): Promise<SubscribeResult> {
  const email = emailRaw.trim().toLowerCase();
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  if (existing && !existing.unsubscribedAt) {
    return { ok: true, alreadySubscribed: true };
  }

  const resendContactId = await syncToAudience(email);

  if (existing) {
    // Реактивация после отписки.
    await prisma.subscriber.update({
      where: { email },
      data: { unsubscribedAt: null, ...(resendContactId ? { resendContactId } : {}) },
    });
  } else {
    await prisma.subscriber.create({ data: { email, source, resendContactId } });
  }

  // Welcome — best-effort.
  try {
    await sendEmail({
      to: email,
      subject: 'Добро пожаловать в STRIDE',
      kind: 'newsletter',
      react: createElement(NewsletterWelcomeEmail, { unsubscribeUrl: buildUnsubscribeUrl(email) }),
    });
  } catch (e) {
    logger.error('newsletter_welcome_failed', e);
  }

  return { ok: true, alreadySubscribed: false };
}
