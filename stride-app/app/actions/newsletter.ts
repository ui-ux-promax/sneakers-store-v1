'use server';

import { headers } from 'next/headers';
import { subscribe } from '@/lib/newsletter/service';
import { newsletterSchema } from '@/services/dto/newsletter.dto';
import { checkNewsletterRateLimit, extractClientIp } from '@/lib/rate-limit';

export type NewsletterResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

export async function subscribeToNewsletter(raw: unknown): Promise<NewsletterResult> {
  const parsed = newsletterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Некорректный email' };

  const ip = extractClientIp({ headers: await headers() });
  if (!(await checkNewsletterRateLimit(ip)).success) {
    return { ok: false, error: 'Слишком часто. Попробуйте позже' };
  }

  const res = await subscribe(parsed.data.email, parsed.data.source ?? 'footer');
  if (!res.ok) return { ok: false, error: 'Не удалось подписаться. Попробуйте позже' };
  return { ok: true, alreadySubscribed: res.alreadySubscribed };
}
