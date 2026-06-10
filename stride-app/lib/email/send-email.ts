import type { ReactElement } from 'react';
import { getResend, isEmailConfigured } from '@/lib/email/resend-client';
import { logger } from '@/lib/logger';

export type EmailKind = 'transactional' | 'newsletter';

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
  kind?: EmailKind; // дефолт transactional (no-reply@)
  replyTo?: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

function fromFor(kind: EmailKind): string {
  if (kind === 'newsletter') {
    return process.env.EMAIL_FROM_NEWSLETTER ?? 'Stride <hello@cloudd3r.eu.cc>';
  }
  return process.env.EMAIL_FROM_TRANSACTIONAL ?? 'Stride <no-reply@cloudd3r.eu.cc>';
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const kind = opts.kind ?? 'transactional';
  const resend = getResend();
  if (!isEmailConfigured() || !resend) {
    logger.warn('email_not_configured', { to: opts.to, subject: opts.subject });
    return { ok: false, error: 'email_not_configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: fromFor(kind),
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error || !data) {
      logger.error('email_send_failed', error, { to: opts.to, subject: opts.subject });
      return { ok: false, error: error?.message ?? 'unknown' };
    }
    logger.info('email_sent', { to: opts.to, subject: opts.subject, id: data.id });
    return { ok: true, id: data.id };
  } catch (e) {
    logger.error('email_send_threw', e, { to: opts.to, subject: opts.subject });
    return { ok: false, error: 'exception' };
  }
}
